  // dashboard.js — logica principal, WebSocket, sesiones
  (function () {
    let sampleCount    = 0;
    let tremorWindows  = 0, tremorPositive = 0;
    let currentSession = null;

    const $ = id => document.getElementById(id);

    // ── WebSocket ──────────────────────────────────────────────
    const socket = io();

    socket.on('connect', function () {
      $('statusDot').className   = 'status-dot live';
      $('statusLabel').textContent = 'LIVE - 50Hz';
    });

    socket.on('disconnect', function () {
      $('statusDot').className   = 'status-dot error';
      $('statusLabel').textContent = 'DESCONECTADO';
    });

    // sensor_data: llega cada 20 ms con datos crudos
    socket.on('sensor_data', function (d) {
      window.emgChart.push(d.emg_mv);
      sampleCount++;
      $('kpiSamples').textContent = sampleCount;

      // Orientacion 3D
      window.arm3d.roll  = d.roll  || 0;
      window.arm3d.pitch = d.pitch || 0;
      $('rollVal').textContent  = (d.roll  || 0).toFixed(1) + '°';
      $('pitchVal').textContent = (d.pitch || 0).toFixed(1) + '°';

      // Magnitud acelerometro (ya viene calculada desde el servidor)
      const mag = d.acc_mag != null ? d.acc_mag
                                    : Math.sqrt(d.ax**2 + d.ay**2 + d.az**2);
      $('accVal').textContent = mag.toFixed(3) + 'g';

      // Cambio de sesion
      if (d.session_id !== currentSession) {
        currentSession = d.session_id;
        $('sessionBadge').textContent = 'session: ' + d.session_id;
        $('patientBadge').textContent = 'patient: ' + d.patient_id;
        loadSessions();
      }

      // Estado EMG basado en mV (MyoWare: ~0-3300 mV)
      const norm = d.emg_mv / 3300;
      const stateEl = $('emgState');
      stateEl.className = 'state-pill';
      if (norm < 0.08)      { stateEl.classList.add('reposo');     stateEl.textContent = 'REPOSO'; }
      else if (norm < 0.35) { stateEl.classList.add('movimiento'); stateEl.textContent = 'MOVIMIENTO'; }
      else                  { stateEl.classList.add('temblor');    stateEl.textContent = 'ACTIVO'; }
    });

    // features: llega cada 0.5 s con RMS y analisis de tremor
    socket.on('features', function (f) {
      tremorWindows++;
      if (f.tremor) tremorPositive++;

      // KPI EMG RMS — aqui si es el RMS real, en mV
      $('kpiRms').textContent = f.emg_rms.toFixed(1);

      $('kpiFreqEmg').textContent = f.f_emg.toFixed(1);
      $('kpiFreqAcc').textContent = f.f_acc.toFixed(1);
      $('fEmg').textContent = f.f_emg.toFixed(2);
      $('fAcc').textContent = f.f_acc.toFixed(2);

      const t = f.tremor ? 1 : 0;
      $('kpiTremor').textContent   = t ? 'SI' : 'NO';
      $('kpiTremor').style.color   = t ? '#ff4757' : '#00e5a0';
      $('kpiTremorSub').textContent = t ? 'detectado' : 'no detectado';

      // Anillo de porcentaje
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

      window.arm3d.tremorActive = !!t;
      window.arm3d.setSensor(!!t);
    });

    // ── Sesiones — un solo request al servidor ─────────────────
    function loadSessions() {
      fetch('/api/sessions/summary')
        .then(r => r.json())
        .then(data => {
          const list = $('sessionList');
          if (!data.sessions || data.sessions.length === 0) {
            list.innerHTML = '<div style="font-size:11px;color:#4a5568;text-align:center;padding:20px;font-family:\'JetBrains
  Mono\',monospace">Sin sesiones aun</div>';
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

    // ── Controles EMG ───────────────────────────────────────────
    $('btnPause').addEventListener('click', function () {
      window.emgChart.paused = !window.emgChart.paused;
      this.textContent = window.emgChart.paused ? 'Reanudar' : 'Pausar';
      this.style.borderColor = window.emgChart.paused ? '#ffa502' : '';
      this.style.color       = window.emgChart.paused ? '#ffa502' : '';
    });

    $('btnClear').addEventListener('click', function () {
      window.emgChart.clear();
      sampleCount = 0; tremorWindows = 0; tremorPositive = 0;
      $('kpiSamples').textContent = '0';
      $('kpiRms').textContent = '—';
      $('tremorRing').setAttribute('stroke-dashoffset', '326.7');
      $('tremorPct').textContent = '0%';
    });

    // ── Exportar CSV real ───────────────────────────────────────
    $('btnExport').addEventListener('click', function () {
      if (!currentSession) { alert('No hay sesion activa'); return; }
      window.location.href = '/api/session/' + currentSession + '/export.csv?limit=5000';
    });

  })();
  DASHEOF
