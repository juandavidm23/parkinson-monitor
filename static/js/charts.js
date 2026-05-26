// charts.js — ECG oscilloscope + IMU chart + Timeline
(function(){

  // ── ECG Chart ──────────────────────────────────────────────
  const ecgCanvas = document.getElementById('ecgCanvas');
  const ecgCtx    = ecgCanvas.getContext('2d');
  const N = 200;

  window.ecgChart = {
    data: new Array(N).fill(1650),
    paused: false,
    max: 0, min: 3300, sum: 0, count: 0,

    push: function(val){
      if(this.paused) return;
      this.data.push(val);
      if(this.data.length > N) this.data.shift();
      if(val > this.max) this.max = val;
      if(val < this.min) this.min = val;
      this.sum += val; this.count++;
      this.draw();
      document.getElementById('ecgMax').textContent = Math.round(this.max) + ' mV';
      document.getElementById('ecgMin').textContent = Math.round(this.min) + ' mV';
      document.getElementById('ecgAvg').textContent = Math.round(this.sum/this.count) + ' mV';
    },

    clear: function(){
      this.data.fill(1650);
      this.max=0; this.min=3300; this.sum=0; this.count=0;
      this.draw();
    },

    draw: function(){
      const w = ecgCanvas.width, h = ecgCanvas.height;
      ecgCtx.clearRect(0,0,w,h);
      ecgCtx.fillStyle = '#161b22';
      ecgCtx.fillRect(0,0,w,h);

      // Línea de referencia mid-rail (1650 mV)
      const midY = h - (1650/3300)*h;
      ecgCtx.strokeStyle = '#1c2330';
      ecgCtx.lineWidth = 0.5;
      for(let i=0;i<=4;i++){
        const y=(h/4)*i;
        ecgCtx.beginPath(); ecgCtx.moveTo(0,y); ecgCtx.lineTo(w,y); ecgCtx.stroke();
      }
      ecgCtx.strokeStyle = 'rgba(0,229,160,0.1)';
      ecgCtx.lineWidth = 1;
      ecgCtx.beginPath(); ecgCtx.moveTo(0,midY); ecgCtx.lineTo(w,midY); ecgCtx.stroke();

      // Señal
      ecgCtx.beginPath();
      ecgCtx.strokeStyle = '#00e5a0';
      ecgCtx.lineWidth = 1.5;
      ecgCtx.shadowColor = '#00e5a0';
      ecgCtx.shadowBlur  = 3;
      const d = this.data;
      for(let i=0;i<d.length;i++){
        const x=(i/(N-1))*w, y=h-(d[i]/3300)*h;
        i===0 ? ecgCtx.moveTo(x,y) : ecgCtx.lineTo(x,y);
      }
      ecgCtx.stroke();
      ecgCtx.shadowBlur = 0;

      // Fill
      ecgCtx.lineTo(w,h); ecgCtx.lineTo(0,h); ecgCtx.closePath();
      ecgCtx.fillStyle = 'rgba(0,229,160,0.04)';
      ecgCtx.fill();
    }
  };

  function resizeEcg(){
    ecgCanvas.width  = ecgCanvas.clientWidth;
    ecgCanvas.height = ecgCanvas.clientHeight || 120;
    window.ecgChart.draw();
  }
  resizeEcg();
  new ResizeObserver(resizeEcg).observe(ecgCanvas);


  // ── IMU Chart ──────────────────────────────────────────────
  const imuCanvas = document.getElementById('imuCanvas');
  const imuCtx    = imuCanvas.getContext('2d');
  const IMU_MAX = 20;  // m/s² — rango de visualización

  window.imuChart = {
    data: new Array(N).fill(9.81),
    paused: false,

    push: function(val){
      if(this.paused) return;
      this.data.push(val);
      if(this.data.length > N) this.data.shift();
      this.draw();
    },

    clear: function(){
      this.data.fill(9.81);
      this.draw();
    },

    draw: function(){
      const w = imuCanvas.width, h = imuCanvas.height;
      imuCtx.clearRect(0,0,w,h);
      imuCtx.fillStyle = '#161b22';
      imuCtx.fillRect(0,0,w,h);

      // Grid
      imuCtx.strokeStyle = '#1c2330';
      imuCtx.lineWidth = 0.5;
      for(let i=0;i<=4;i++){
        const y=(h/4)*i;
        imuCtx.beginPath(); imuCtx.moveTo(0,y); imuCtx.lineTo(w,y); imuCtx.stroke();
      }

      // Línea de gravedad (9.81 m/s²)
      const gravY = h - (9.81/IMU_MAX)*h;
      imuCtx.strokeStyle = 'rgba(0,150,255,0.15)';
      imuCtx.lineWidth = 1;
      imuCtx.beginPath(); imuCtx.moveTo(0,gravY); imuCtx.lineTo(w,gravY); imuCtx.stroke();

      // Señal
      imuCtx.beginPath();
      imuCtx.strokeStyle = '#0096ff';
      imuCtx.lineWidth = 1.5;
      imuCtx.shadowColor = '#0096ff';
      imuCtx.shadowBlur  = 3;
      const d = this.data;
      for(let i=0;i<d.length;i++){
        const x=(i/(N-1))*w;
        const y=h-(Math.min(d[i],IMU_MAX)/IMU_MAX)*h;
        i===0 ? imuCtx.moveTo(x,y) : imuCtx.lineTo(x,y);
      }
      imuCtx.stroke();
      imuCtx.shadowBlur = 0;

      imuCtx.lineTo(w,h); imuCtx.lineTo(0,h); imuCtx.closePath();
      imuCtx.fillStyle = 'rgba(0,150,255,0.04)';
      imuCtx.fill();

      // Etiqueta 9.81 m/s²
      imuCtx.fillStyle = 'rgba(0,150,255,0.4)';
      imuCtx.font = '9px JetBrains Mono, monospace';
      imuCtx.fillText('9.81 m/s²', 4, gravY - 3);
    }
  };

  function resizeImu(){
    imuCanvas.width  = imuCanvas.clientWidth;
    imuCanvas.height = imuCanvas.clientHeight || 120;
    window.imuChart.draw();
  }
  resizeImu();
  new ResizeObserver(resizeImu).observe(imuCanvas);


  // ── Timeline Chart ─────────────────────────────────────────
  const tlCanvas = document.getElementById('timelineCanvas');
  const tlCtx    = tlCanvas.getContext('2d');
  const TL_MAX   = 240;  // ~2 minutos a ~0.5s por ventana

  window.timelineChart = {
    events: [],   // [{tremor:0|1, rms:float}]

    push: function(tremor, rms){
      this.events.push({tremor, rms});
      if(this.events.length > TL_MAX) this.events.shift();
      this.draw();
    },

    clear: function(){
      this.events = [];
      this.draw();
    },

    draw: function(){
      const w = tlCanvas.width, h = tlCanvas.height;
      tlCtx.clearRect(0,0,w,h);
      tlCtx.fillStyle = '#0d1117';
      tlCtx.fillRect(0,0,w,h);

      if(this.events.length === 0) return;

      const blockW = w / TL_MAX;
      const maxRms = 1000;

      // Rellenar con bloques vacíos a la izquierda si hay pocos eventos
      const offset = TL_MAX - this.events.length;

      this.events.forEach((ev, i) => {
        const x = (offset + i) * blockW;
        const barH = Math.max(4, (ev.rms / maxRms) * h);
        const y = h - barH;

        if(ev.tremor){
          tlCtx.fillStyle = 'rgba(255,71,87,0.85)';
        } else {
          tlCtx.fillStyle = 'rgba(0,229,160,0.5)';
        }
        tlCtx.fillRect(x, y, Math.max(1, blockW - 1), barH);
      });

      // Línea base
      tlCtx.strokeStyle = 'rgba(255,255,255,0.05)';
      tlCtx.lineWidth = 1;
      tlCtx.beginPath(); tlCtx.moveTo(0,h-1); tlCtx.lineTo(w,h-1); tlCtx.stroke();
    }
  };

  function resizeTl(){
    tlCanvas.width  = tlCanvas.clientWidth  || 200;
    tlCanvas.height = tlCanvas.clientHeight || 50;
    window.timelineChart.draw();
  }
  resizeTl();
  new ResizeObserver(resizeTl).observe(tlCanvas);

})();
