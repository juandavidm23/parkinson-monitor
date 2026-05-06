// charts.js — EMG oscilloscope canvas
(function(){
  const canvas = document.getElementById('emgCanvas');
  const ctx = canvas.getContext('2d');
  const N = 200;
  window.emgChart = {
    data: new Array(N).fill(512),
    paused: false,
    max: 0, min: 4095, sum: 0, count: 0,

    push: function(val){
      if(this.paused) return;
      this.data.push(val);
      if(this.data.length > N) this.data.shift();
      if(val > this.max) this.max = val;
      if(val < this.min) this.min = val;
      this.sum += val; this.count++;
      this.draw();
      // Update stat labels
      document.getElementById('emgMax').textContent = this.max;
      document.getElementById('emgMin').textContent = this.min;
      document.getElementById('emgAvg').textContent = Math.round(this.sum/this.count);
    },

    clear: function(){
      this.data.fill(512);
      this.max=0; this.min=4095; this.sum=0; this.count=0;
      this.draw();
    },

    draw: function(){
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = '#161b22';
      ctx.fillRect(0,0,w,h);

      // Grid
      ctx.strokeStyle = '#1c2330';
      ctx.lineWidth = 0.5;
      for(let i=0;i<=4;i++){
        const y=(h/4)*i;
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
      }

      // Signal
      ctx.beginPath();
      ctx.strokeStyle = '#00e5a0';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = '#00e5a0';
      ctx.shadowBlur = 3;
      const d = this.data;
      for(let i=0;i<d.length;i++){
        const x=(i/(N-1))*w, y=h-(d[i]/4095)*h;
        i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Fill
      ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath();
      ctx.fillStyle = 'rgba(0,229,160,0.04)';
      ctx.fill();
    }
  };

  function resize(){
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight || 120;
    window.emgChart.draw();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
})();
