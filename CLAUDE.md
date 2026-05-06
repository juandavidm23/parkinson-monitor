 # NeuroTrack — Parkinson Monitor

  Sistema académico de monitoreo de Parkinson. Captura señales biomédicas en tiempo real,
  las procesa y las visualiza en un dashboard web.

  ## Arquitectura completa

  ESP32 (MPU6050 + MyoWare EMG)
    └─ MQTT (WiFi) → Raspberry Pi
                        ├─ Mosquitto (broker MQTT, puerto 1883)
                        ├─ processor.py (subscriber, FFT, detección tremor)
                        ├─ InfluxDB v1 (almacenamiento, puerto 8086)
                        └─ Flask + SocketIO (dashboard, puerto 5000)

  ## Archivos clave

  | Archivo | Rol |
  |---|---|
  | `config.py` | Configuración central (MQTT, InfluxDB, Flask, parámetros señal) |
  | `processor.py` | Recibe MQTT, calcula features (FFT, RMS, tremor), emite WebSocket |
  | `influx_client.py` | Wrapper InfluxDB v1 — measurements: `raw_signals`, `features` |
  | `app.py` | Flask + SocketIO + API REST |
  | `templates/index.html` | Dashboard principal |
  | `static/js/arm3d.js` | Visualización 3D del sensor con Three.js |
  | `static/js/charts.js` | Osciloscopio EMG en canvas |
  | `static/js/dashboard.js` | Lógica WebSocket, sesiones, KPIs |

  ## Sensores y frecuencias

  - **MPU6050** (IMU): muestreo a 100 Hz — cubre temblor Parkinson (3–12 Hz)
  - **MyoWare EMG**: muestreo a 1000 Hz en el ESP32, envío MQTT a 50 Hz con RMS pre-calculado
  - **DLPF MPU6050**: configurado a 20 Hz de ancho de banda
  - **Ventana de análisis**: 150 muestras × 50 Hz = 3 segundos con overlap de 0.5 s

  ## Formato JSON que envía el ESP32

  ```json
  {
    "device_id": "esp32_01",
    "patient_id": "patient_01",
    "session_id": "A1B2C3D4_1714921456",
    "ts": 1714921456280,
    "emg": { "mv": 1245.6, "rms_mv": 1189.3 },
    "accel": { "x": 0.021, "y": -0.015, "z": 0.998, "mag": 0.9998 },
    "gyro":  { "x": 0.12, "y": -0.08, "z": 0.03 },
    "orientation": { "roll": 1.2, "pitch": -0.8 }
  }

  processor.py también acepta el formato antiguo con raw_emg (compatibilidad).

  InfluxDB — estructura de datos

  Measurement raw_signals (tags: device_id, patient_id, session_id):
  - emg_mv, ax, ay, az, acc_mag, gx, gy, gz, roll, pitch

  Measurement features (tags: device_id, patient_id, session_id):
  - emg_rms, emg_mean, emg_std, freq_emg, freq_acc, tremor, acc_mag

  API REST

  ┌──────────────────────────────────┬────────────────────────────────────────────┐
  │             Endpoint             │                Descripción                 │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /                            │ Dashboard principal                        │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /api/sessions                │ Lista de session_ids                       │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /api/sessions/summary        │ Sesiones con % de tremor (un solo request) │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /api/session/<id>            │ Datos raw de una sesión                    │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /api/session/<id>/features   │ Features calculados                        │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /api/session/<id>/export.csv │ Descarga CSV real                          │
  ├──────────────────────────────────┼────────────────────────────────────────────┤
  │ GET /api/health                  │ Estado del servidor                        │
  └──────────────────────────────────┴────────────────────────────────────────────┘

  WebSocket eventos

  - sensor_data → llega cada 20 ms con datos crudos del ESP32
  - features → llega cada 0.5 s con RMS, frecuencias dominantes y flag de tremor

  Despliegue en Raspberry Pi

  # SSH a la RPi
  ssh pi@<ip-raspberry>

  # Levantar servidor
  cd /home/pi/parkinson-monitor
  source venv/bin/activate
  python app.py

  # Actualizar desde GitHub y reiniciar
  bash update.sh

  Instalar dependencias (primera vez)

  cd /home/pi/parkinson-monitor
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt

  Firmware ESP32

  El archivo .ino está en el repositorio separado MPU_EMG_MQTT_FINAL.
  Configurar en el firmware: SSID, PASS, MQTT_HOST (IP de la Raspberry Pi).

  Estado actual del proyecto

  - Proyecto académico — no es ML todavía pero los datos quedan estructurados para análisis futuro
  - La detección de tremor es un heurístico simple (FFT + coherencia EMG/ACC)
  - El sensor EMG (MyoWare) requiere electrodos en el antebrazo para señal válida
  - El MPU6050 está montado en protoboard — pendiente diseño wearable para dorso de la mano
