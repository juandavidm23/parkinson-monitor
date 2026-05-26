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

ecg_buffer   = deque(maxlen=WINDOW_SIZE)
acc_buffer   = deque(maxlen=WINDOW_SIZE)
sample_count = 0


def fft_dominant_freq(signal: list) -> float:
    """Frecuencia dominante de la senal via FFT con ventana Hanning."""
    arr = np.array(signal, dtype=float)
    arr -= arr.mean()
    arr *= np.hanning(len(arr))
    fft_mag = np.abs(np.fft.rfft(arr))
    freqs   = np.fft.rfftfreq(len(arr), d=1.0 / SAMPLE_RATE)
    fft_mag[0] = 0  # ignorar DC
    return float(freqs[np.argmax(fft_mag)])


def calcular_features(ecg_w: list, acc_w: list) -> dict:
    ecg = np.array(ecg_w, dtype=float)
    acc = np.array(acc_w, dtype=float)

    # AC RMS: eliminar DC antes de calcular energia
    rms   = float(np.sqrt(np.mean((ecg - ecg.mean()) ** 2)))
    f_acc = fft_dominant_freq(acc_w)

    # Deteccion: frecuencia IMU en rango Parkinson (3-7Hz) + musculo activo
    acc_in_range  = TREMOR_FREQ_MIN <= f_acc <= TREMOR_FREQ_MAX
    muscle_active = rms > 30.0  # mV
    tremor = 1 if (acc_in_range and muscle_active) else 0

    return {
        "rms": rms, "f_acc": f_acc,
        "tremor": tremor,
        "acc_mag": float(np.mean(acc)),
    }


def _parse_ecg(data: dict) -> float:
    """Retorna ecg_mv del JSON del ESP32."""
    ecg_node = data.get("ecg", {})
    if isinstance(ecg_node, dict):
        return ecg_node.get("mv", 0.0)
    return 0.0


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

        ecg_mv     = _parse_ecg(data)
        estado_esp = data.get("estado", "REPOSO")

        accel   = data["accel"]
        ax, ay, az = accel["x"], accel["y"], accel["z"]
        # acc_mag ahora viene en m/s2 desde el ESP32
        acc_mag = accel.get("ms2", float(np.sqrt(ax**2 + ay**2 + az**2) * 9.81))

        gyro    = data["gyro"]
        gx, gy, gz = gyro["x"], gyro["y"], gyro["z"]
        gyro_degs  = gyro.get("degs", float(np.sqrt(gx**2 + gy**2 + gz**2)))

        orient = data.get("orientation", {})
        roll   = orient.get("roll",  0.0)
        pitch  = orient.get("pitch", 0.0)

    except KeyError as e:
        print(f"[MQTT] Campo faltante en JSON: {e}")
        return

    # 1. Emitir por WebSocket (tiempo real) — solo lo que el dashboard usa
    if _socketio:
        _socketio.emit("sensor_data", {
            "ecg_mv":     round(ecg_mv, 2),
            "acc_mag":    round(acc_mag, 3),
            "estado_esp": estado_esp,
            "session_id": session_id,
        })

    # 2. Acumular en buffers para features
    ecg_buffer.append(ecg_mv)
    acc_buffer.append(acc_mag)
    sample_count += 1

    # 3. Calcular features cada WINDOW_STEP muestras
    if len(ecg_buffer) == WINDOW_SIZE and sample_count % WINDOW_STEP == 0:
        feats = calcular_features(list(ecg_buffer), list(acc_buffer))
        feats.update({
            "device_id": device_id,
            "patient_id": patient_id,
            "session_id": session_id,
        })
        db.write_features(feats)

        if _socketio:
            _socketio.emit("features", {
                "tremor":     feats["tremor"],
                "f_acc":      round(feats["f_acc"], 2),
                "ecg_rms":    round(feats["rms"], 2),
                "session_id": session_id,
            })

        print(f"[Features] tremor={feats['tremor']} | "
              f"f_acc={feats['f_acc']:.2f}Hz | "
              f"rms={feats['rms']:.2f}mV | "
              f"estado_esp={estado_esp}")


def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] Conectado - suscrito a '{MQTT_TOPIC}'")
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
