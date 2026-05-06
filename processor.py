  # processor.py — pipeline MQTT -> features -> InfluxDB -> WebSocket
  import json
  import numpy as np
  import paho.mqtt.client as mqtt
  from collections import deque

  import influx_client as db
  from config import (
      MQTT_BROKER, MQTT_PORT, MQTT_TOPIC,
      SAMPLE_RATE, WINDOW_SIZE, WINDOW_STEP,
      TREMOR_FREQ_MIN, TREMOR_FREQ_MAX
  )

  _socketio = None

  def init_socketio(sio):
      global _socketio
      _socketio = sio

  emg_buffer    = deque(maxlen=WINDOW_SIZE)
  acc_buffer    = deque(maxlen=WINDOW_SIZE)
  sample_count  = 0


  def fft_dominant_freq(signal: list) -> float:
      """Frecuencia dominante de la senal via FFT con ventana Hanning."""
      arr = np.array(signal, dtype=float)
      arr -= arr.mean()
      arr *= np.hanning(len(arr))
      fft_mag = np.abs(np.fft.rfft(arr))
      freqs   = np.fft.rfftfreq(len(arr), d=1.0 / SAMPLE_RATE)
      fft_mag[0] = 0  # ignorar DC
      return float(freqs[np.argmax(fft_mag)])


  def calcular_features(emg_w: list, acc_w: list) -> dict:
      emg = np.array(emg_w, dtype=float)
      acc = np.array(acc_w, dtype=float)

      rms  = float(np.sqrt(np.mean(emg ** 2)))
      mean = float(np.mean(emg))
      std  = float(np.std(emg))

      f_emg = fft_dominant_freq(emg_w)
      f_acc = fft_dominant_freq(acc_w)

      in_range = (TREMOR_FREQ_MIN <= f_emg <= TREMOR_FREQ_MAX and
                  TREMOR_FREQ_MIN <= f_acc <= TREMOR_FREQ_MAX)
      coherent = abs(f_emg - f_acc) < 1.5
      tremor   = 1 if (in_range and coherent) else 0

      return {
          "rms": rms, "mean": mean, "std": std,
          "f_emg": f_emg, "f_acc": f_acc,
          "tremor": tremor,
          "acc_mag": float(np.mean(acc)),
      }


  def _parse_emg(data: dict):
      """
      Acepta tanto el formato nuevo (data.emg.mv) como el antiguo (data.raw_emg).
      Siempre devuelve el valor en mV.
      """
      emg_node = data.get("emg")
      if isinstance(emg_node, dict):
          return emg_node.get("mv", 0.0)
      # Formato antiguo: ADC crudo 0-4095 -> mV
      raw = data.get("raw_emg", 0)
      return (raw / 4095.0) * 3300.0


  def on_message(client, userdata, msg):
      global sample_count

      try:
          data = json.loads(msg.payload.decode())
      except json.JSONDecodeError as e:
          print(f"[MQTT] JSON invalido: {e}")
          return

      try:
          device_id  = data["device_id"]
          patient_id = data["patient_id"]
          session_id = data["session_id"]

          emg_mv = _parse_emg(data)

          accel  = data["accel"]
          ax, ay, az = accel["x"], accel["y"], accel["z"]
          acc_mag = accel.get("mag", float(np.sqrt(ax**2 + ay**2 + az**2)))

          gyro   = data["gyro"]
          gx, gy, gz = gyro["x"], gyro["y"], gyro["z"]

          orient = data.get("orientation", {})
          roll   = orient.get("roll",  0.0)
          pitch  = orient.get("pitch", 0.0)

      except KeyError as e:
          print(f"[MQTT] Campo faltante en JSON: {e}")
          return

      # 1. Guardar raw en InfluxDB
      db.write_raw({
          "device_id": device_id, "patient_id": patient_id,
          "session_id": session_id,
          "emg_mv": emg_mv,
          "ax": ax, "ay": ay, "az": az, "acc_mag": acc_mag,
          "gx": gx, "gy": gy, "gz": gz,
          "roll": roll, "pitch": pitch,
      })

      # 2. Emitir por WebSocket (tiempo real)
      if _socketio:
          _socketio.emit("sensor_data", {
              "ts":       data.get("ts", 0),
              "emg_mv":   round(emg_mv, 2),
              "ax": ax, "ay": ay, "az": az, "acc_mag": round(acc_mag, 4),
              "gx": gx, "gy": gy, "gz": gz,
              "roll":     roll,
              "pitch":    pitch,
              "session_id": session_id,
              "patient_id": patient_id,
          })

      # 3. Acumular en buffers para features
      emg_buffer.append(emg_mv)
      acc_buffer.append(acc_mag)
      sample_count += 1

      # 4. Calcular features cada WINDOW_STEP muestras
      if len(emg_buffer) == WINDOW_SIZE and sample_count % WINDOW_STEP == 0:
          feats = calcular_features(list(emg_buffer), list(acc_buffer))
          feats.update({
              "device_id": device_id,
              "patient_id": patient_id,
              "session_id": session_id,
          })
          db.write_features(feats)

          if _socketio:
              _socketio.emit("features", {
                  "tremor":   feats["tremor"],
                  "f_emg":    round(feats["f_emg"], 2),
                  "f_acc":    round(feats["f_acc"], 2),
                  "emg_rms":  round(feats["rms"], 2),
                  "session_id": session_id,
              })

          print(f"[Features] tremor={feats['tremor']} | "
                f"f_emg={feats['f_emg']:.2f}Hz | "
                f"f_acc={feats['f_acc']:.2f}Hz | "
                f"rms={feats['rms']:.2f}mV")


  def on_connect(client, userdata, flags, rc):
      if rc == 0:
          print(f"[MQTT] Conectado — suscrito a '{MQTT_TOPIC}'")
          client.subscribe(MQTT_TOPIC)
      else:
          print(f"[MQTT] Error conexion rc={rc}")


  def on_disconnect(client, userdata, rc):
      print(f"[MQTT] Desconectado rc={rc} — reconectando...")


  def start_mqtt():
      client = mqtt.Client()
      client.on_connect    = on_connect
      client.on_message    = on_message
      client.on_disconnect = on_disconnect
      client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
      client.loop_start()
      return client
  
