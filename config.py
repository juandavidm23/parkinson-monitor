# =============================================
# config.py — configuración central del sistema
# =============================================

# MQTT
MQTT_BROKER   = "localhost"
MQTT_PORT     = 1883
MQTT_TOPIC   = "parkinson/+/data"

# InfluxDB v1
INFLUX_HOST   = "localhost"
INFLUX_PORT   = 8086
INFLUX_DB     = "parkinson"

# Flask
FLASK_HOST    = "0.0.0.0"
FLASK_PORT    = 5000
SECRET_KEY    = "parkinson-monitor-secret"

# Procesamiento de señal
SAMPLE_RATE   = 50          # Hz — debe coincidir con el ESP32
WINDOW_SIZE   = 150         # muestras = 3 segundos a 50Hz
WINDOW_STEP   = 25          # overlap: avanza 0.5s, mantiene contexto

# Rango de tremor Parkinson (Hz)
TREMOR_FREQ_MIN = 3.0
TREMOR_FREQ_MAX = 7.0
