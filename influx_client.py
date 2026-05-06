# influx_client.py — wrapper InfluxDB v1
import re
import time
from influxdb import InfluxDBClient
from config import INFLUX_HOST, INFLUX_PORT, INFLUX_DB

_client = None

def get_client():
      global _client
      if _client is None:
          _client = InfluxDBClient(host=INFLUX_HOST, port=INFLUX_PORT, database=INFLUX_DB)
      return _client


def _safe_session_id(session_id: str) -> str:
      """Valida que session_id solo tenga caracteres seguros."""
      if not re.match(r'^[A-Za-z0-9_\-]+$', session_id):
          raise ValueError(f"session_id invalido: {session_id!r}")
      return session_id


def write_raw(data: dict):
      """Guarda una muestra raw de sensores."""
      point = {
          "measurement": "raw_signals",
          "tags": {
              "device_id":  data["device_id"],
              "patient_id": data["patient_id"],
              "session_id": data["session_id"],
          },
          "fields": {
              "emg_mv":  float(data["emg_mv"]),
              "ax":      float(data["ax"]),
              "ay":      float(data["ay"]),
              "az":      float(data["az"]),
              "gx":      float(data["gx"]),
              "gy":      float(data["gy"]),
              "gz":      float(data["gz"]),
              "acc_mag": float(data.get("acc_mag", 0.0)),
              "roll":    float(data.get("roll",    0.0)),
              "pitch":   float(data.get("pitch",   0.0)),
          }
      }
      _safe_write([point])


def write_features(data: dict):
      """Guarda features calculados por ventana."""
      point = {
          "measurement": "features",
          "tags": {
              "device_id":  data["device_id"],
              "patient_id": data["patient_id"],
              "session_id": data["session_id"],
          },
          "fields": {
              "emg_rms":  float(data["rms"]),
              "emg_mean": float(data["mean"]),
              "emg_std":  float(data["std"]),
              "freq_emg": float(data["f_emg"]),
              "freq_acc": float(data["f_acc"]),
              "tremor":   int(data["tremor"]),
              "acc_mag":  float(data["acc_mag"]),
          }
      }
      _safe_write([point])


def _safe_write(points, retries=3):
      for attempt in range(retries):
          try:
              get_client().write_points(points)
              return
          except Exception as e:
              print(f"[InfluxDB] Error escritura (intento {attempt+1}): {e}")
              _client = None  # forzar reconexion
              time.sleep(0.5)


def query_sessions():
      """Lista sesiones unicas almacenadas."""
      try:
          # SHOW TAG VALUES es la forma correcta en InfluxDB v1 para tags
          result = get_client().query(
              'SHOW TAG VALUES FROM raw_signals WITH KEY = "session_id"'
          )
          return [p["value"] for p in result.get_points()]
      except Exception as e:
          print(f"[InfluxDB] Error query sessions: {e}")
          return []


def query_sessions_summary():
      """Devuelve todas las sesiones con su porcentaje de tremor."""
      sessions = query_sessions()
      summary = []
      for sid in sessions:
          pct = query_recent_tremor_summary(sid)
          summary.append({"session_id": sid, "tremor_pct": pct})
      return summary


def query_session_data(session_id: str, limit: int = 500):
      """Datos raw de una sesion para visualizacion historica."""
      try:
          sid = _safe_session_id(session_id)
          q = (
              f'SELECT emg_mv, ax, ay, az, gx, gy, gz, acc_mag, roll, pitch '
              f'FROM raw_signals '
              f'WHERE session_id=\'{sid}\' '
              f'ORDER BY time ASC LIMIT {int(limit)}'
          )
          result = get_client().query(q)
          return list(result.get_points())
      except Exception as e:
          print(f"[InfluxDB] Error query session: {e}")
          return []


def query_session_features(session_id: str):
      """Features de una sesion para analisis clinico."""
      try:
          sid = _safe_session_id(session_id)
          q = (
              f'SELECT emg_rms, emg_mean, emg_std, freq_emg, freq_acc, tremor, acc_mag '
              f'FROM features '
              f'WHERE session_id=\'{sid}\' '
              f'ORDER BY time ASC'
          )
          result = get_client().query(q)
          return list(result.get_points())
      except Exception as e:
          print(f"[InfluxDB] Error query features: {e}")
          return []


def query_recent_tremor_summary(session_id: str):
      """Porcentaje de ventanas con tremor detectado en la sesion."""
      try:
          sid = _safe_session_id(session_id)
          q = (
              f'SELECT COUNT(tremor) as total, SUM(tremor) as positivos '
              f'FROM features WHERE session_id=\'{sid}\''
          )
          pts = list(get_client().query(q).get_points())
          if pts and pts[0]["total"]:
              pct = (pts[0]["positivos"] or 0) / pts[0]["total"] * 100
              return round(pct, 1)
          return 0.0
      except Exception as e:
          print(f"[InfluxDB] Error tremor summary: {e}")
          return 0.0
