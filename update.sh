#!/bin/bash
cd /home/pi/parkinson-monitor
source venv/bin/activate
pkill -f "python app.py"
  2>/dev/null
sleep 1
python app.py &
echo "Servidor reiniciado"
