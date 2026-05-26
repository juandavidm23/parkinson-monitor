# influx_client.py — wrapper InfluxDB v1 (simplificado)
import time
from influxdb import InfluxDBClient
from config import INFLUX_HOST, INFLUX_PORT, INFLUX_DB

_client = None

def get_client():
    global _client
    if _client is None:
        _client = InfluxDBClient(host=INFLUX_HOST, port=INFLUX_PORT, database=INFLUX_DB)
    return _client


def write_features(data: dict):
    """Guarda features por ventana: tremor, frecuencia ACC, RMS ECG, magnitud ACC."""
    point = {
        "measurement": "features",
        "tags": {
            "device_id":  data["device_id"],
            "patient_id": data["patient_id"],
            "session_id": data["session_id"],
        },
        "fields": {
            "tremor":    int(data["tremor"]),
            "freq_acc":  float(data["f_acc"]),
            "ecg_rms":   float(data["rms"]),
            "acc_mag":   float(data["acc_mag"]),
        }
    }
    _safe_write([point])


def _safe_write(points, retries=3):
    global _client
    for attempt in range(retries):
        try:
            get_client().write_points(points)
            return
        except Exception as e:
            print(f"[InfluxDB] Error escritura (intento {attempt+1}): {e}")
            _client = None
            time.sleep(0.5)
