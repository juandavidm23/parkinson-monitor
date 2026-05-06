# =============================================
# app.py — Flask + SocketIO + API REST
# =============================================

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO
import influx_client as db
import processor
from config import FLASK_HOST, FLASK_PORT, SECRET_KEY

app = Flask(__name__)
app.config["SECRET_KEY"] = SECRET_KEY
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Inyectar socketio al processor para que pueda emitir eventos
processor.init_socketio(socketio)


# ─── Rutas HTML ───────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ─── API REST ────────────────────────────────
@app.route("/api/sessions")
def api_sessions():
    """Lista de todas las sesiones registradas."""
    sessions = db.query_sessions()
    return jsonify({"sessions": sessions})


@app.route("/api/session/<session_id>")
def api_session_data(session_id):
    """Datos raw de una sesión específica."""
    limit = request.args.get("limit", 500, type=int)
    data  = db.query_session_data(session_id, limit)
    return jsonify({"session_id": session_id, "data": data, "count": len(data)})


@app.route("/api/session/<session_id>/features")
def api_session_features(session_id):
    """Features calculados de una sesión."""
    features = db.query_session_features(session_id)
    tremor_pct = db.query_recent_tremor_summary(session_id)
    return jsonify({
        "session_id":  session_id,
        "features":    features,
        "tremor_pct":  tremor_pct,
        "count":       len(features)
    })


@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok"})


# ─── WebSocket events ────────────────────────
@socketio.on("connect")
def on_client_connect():
    print("[WS] Cliente conectado al dashboard")


@socketio.on("disconnect")
def on_client_disconnect():
    print("[WS] Cliente desconectado")


# ─── Main ────────────────────────────────────
if __name__ == "__main__":
    mqtt_client = processor.start_mqtt()
    print(f"[Flask] Servidor en http://{FLASK_HOST}:{FLASK_PORT}")
    socketio.run(app, host=FLASK_HOST, port=FLASK_PORT)
