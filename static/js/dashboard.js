// dashboard.js — lógica principal, WebSocket, sesiones
(function () {
  let sampleCount   = 0;
  let tremorWindows = 0, tremorPositive = 0;
  let currentSession = null;

  const $ = id => document.getElementById(id);

  // ── Semáforo ────────────────────────────────────────────────
  function actualizarSemaforo(estado) {
    const rojo     = $('luzRojo');
    const amarillo = $('luzAmarillo');
    const verde    = $('luzVerde');
    const label    = $('semaforoLabel');
    const sub      = $('semaforoSub');

    rojo.classList.remove('active');
    amarillo.classList.remove('active');
    verde.classList.remove('active');

    if (estado === 'TEMBLOR') {
      rojo.classList.add('active');
      label.textContent = 'TEMBLOR';
      label.style.color = '#ff4757';
      sub.textContent   = 'Temblor detectado';
    } else {
      verde.classList.add('active');
      label.textContent = 'REPOSO';
      label.style.color = '#00e5a0';
      sub.textContent   = 'Sin actividad de temblor';
    }
  }

  // ── WebSocket ───────────────────────────────────────────────
  const socket = io();

  socket.on('connect', function () {
    $('statusDot').className    = 'status-dot live';
    $('statusLabel').textContent = 'LIVE - 50Hz';
  });

  socket.on('disconnect', function () {
    $('statusDot').className    = 'status-dot error';
    $('statusLabel').textContent = 'DESCONECTADO';
  });

  // sensor_data: llega cada 20 ms con datos crudos
  socket.on('sensor_data', function (d) {
    // Gráficas en tiempo real
    window.ecgChart.push(d.ecg_mv);
    window.imuChart.push(d.acc_mag);

    sampleCount++;
    $('kpiSamples').textContent = sampleCount;
    $('kpiAccMag').textContent  = (d.acc_mag || 0).toFixed(2);

    // Valores IMU
    $('imuAccVal').textContent   = (d.acc_mag   || 0).toFixed(2) + ' m/s²';
    $('imuGyroVal').textContent  = (d.gyro_degs || 0).toFixed(1) + ' °/s';
    $('imuOrientVal').textContent =
      (d.roll  || 0).toFixed(1) + '° / ' +
      (d.pitch || 0).toFixed(1) + '°';

    // Semáforo basado en estado del ESP32 (tiempo real)
    actualizarSemaforo(d.estado_esp || 'REPOSO');

    // Estado músculo en panel ECG
    const rms  = d.ecg_rms_mv || 0;
    const stEl = $('ecgState');
    stEl.className = 'state-pill';
    if (rms > 400) {
      stEl.classList.add('temblor');
      stEl.textContent = 'ACTIVO';
    } else {
      stEl.classList.add('reposo');
      stEl.textContent = 'REPOSO';
    }

    // Cambio de sesión
    if (d.session_id !== currentSession) {
      currentSession = d.session_id;
      $('sessionBadge').textContent = 'session: ' + d.session_id;
      $('patientBadge').textContent = 'patient: ' + d.patient_id;
      loadSessions();
    }
  });

  // features: llega cada ~0.5 s con análisis por ventana
  socket.on('features', function (f) {
    tremorWindows++;
    if (f.tremor) tremorPositive++;

    // KPI
    $('kpiRms').textContent     = (f.ecg_rms || 0).toFixed(1);
    $('kpiFreqAcc').textContent = (f.f_acc   || 0).toFixed(1);
    $('fEcg').textContent       = (f.f_ecg   || 0).toFixed(2);
    $('fAcc').textContent       = (f.f_acc   || 0).toFixed(2);

    const t = f.tremor ? 1 : 0;
    $('kpiTremor').textContent    = t ? 'SI' : 'NO';
    $('kpiTremor').style.color    = t ? '#ff4757' : '#00e5a0';
    $('kpiTremorSub').textContent = t ? 'detectado' : 'no detectado';

    // Anillo de porcentaje de sesión
    const pct  = Math.round((tremorPositive / tremorWindows) * 100);
    const circ = 326.7;
    const ring = $('tremorRing');
    ring.setAttribute('stroke-dashoffset', circ - (pct / 100) * circ);
    ring.setAttribute('stroke', pct > 20 ? '#ff4757' : '#00e5a0');
    $('tremorPct').textContent = pct + '%';
    $('tremorPct').setAttribute('fill', pct > 20 ? '#ff4757' : '#00e5a0');

    const tag = $('tremorTag');
    tag.textContent = t ? 'DETECTADO' : 'NORMAL';
    tag.style.cssText = t
      ? 'background:rgba(255,71,87,0.15);color:#ff4757;border:1px solid rgba(255,71,87,0.3);'
      : 'background:rgba(0,229,160,0.1);color:#00e5a0;border:1px solid rgba(0,229,160,0.2);';

    // Timeline
    window.timelineChart.push(t, f.ecg_rms || 0);
  });

  // ── Sesiones ────────────────────────────────────────────────
  function loadSessions() {
    fetch('/api/sessions/summary')
      .then(r => r.json())
      .then(data => {
        const list = $('sessionList');
        if (!data.sessions || data.sessions.length === 0) {
          list.innerHTML = '<div style="font-size:11px;color:#4a5568;text-align:center;padding:20px;font-family:\'JetBrains Mono\',monospace">Sin sesiones aun</div>';
          return;
        }
        list.innerHTML = '';
        data.sessions.forEach(s => {
          const div = document.createElement('div');
          div.className = 'session-item' + (s.session_id === currentSession ? ' active' : '');
          const pct = s.tremor_pct || 0;
          div.innerHTML = `
            <div class="si-id mono">${s.session_id}</div>
            <div class="si-tremor ${pct > 20 ? 'high' : 'low'} mono">${pct}% tremor</div>
          `;
          div.addEventListener('click', () => {
            window.open('/api/session/' + s.session_id + '/features', '_blank');
          });
          list.appendChild(div);
        });
      })
      .catch(console.error);
  }

  loadSessions();
  setInterval(loadSessions, 30000);

  // ── Controles ECG ───────────────────────────────────────────
  $('btnPause').addEventListener('click', function () {
    window.ecgChart.paused = !window.ecgChart.paused;
    window.imuChart.paused = !window.imuChart.paused;
    this.textContent = window.ecgChart.paused ? 'Reanudar' : 'Pausar';
    this.style.borderColor = window.ecgChart.paused ? '#ffa502' : '';
    this.style.color       = window.ecgChart.paused ? '#ffa502' : '';
  });

  $('btnClear').addEventListener('click', function () {
    window.ecgChart.clear();
    window.imuChart.clear();
    window.timelineChart.clear();
    sampleCount = 0; tremorWindows = 0; tremorPositive = 0;
    $('kpiSamples').textContent = '0';
    $('kpiRms').textContent     = '—';
    $('tremorRing').setAttribute('stroke-dashoffset', '326.7');
    $('tremorPct').textContent  = '0%';
  });

  // ── Exportar CSV ────────────────────────────────────────────
  $('btnExport').addEventListener('click', function () {
    if (!currentSession) { alert('No hay sesion activa'); return; }
    window.location.href = '/api/session/' + currentSession + '/export.csv?limit=5000';
  });

})();
