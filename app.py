import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO
import processor
from config import FLASK_HOST, FLASK_PORT, SECRET_KEY

app = Flask(__name__)
app.config["SECRET_KEY"] = SECRET_KEY
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

processor.init_socketio(socketio)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok"})


@socketio.on("connect")
def on_client_connect():
    print("[WS] Cliente conectado al dashboard")


@socketio.on("disconnect")
def on_client_disconnect():
    print("[WS] Cliente desconectado")


if __name__ == "__main__":
    mqtt_client = processor.start_mqtt()
    print(f"[Flask] Servidor en http://{FLASK_HOST}:{FLASK_PORT}")
    socketio.run(app, host=FLASK_HOST, port=FLASK_PORT)
