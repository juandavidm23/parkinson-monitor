  // arm3d.js — visualizacion 3D del sensor MPU6050 con Three.js
  (function () {
    const canvas = document.getElementById('canvas3d');
    if (!canvas || typeof THREE === 'undefined') return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x161b22, 1);
    renderer.shadowMap.enabled = true;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x161b22, 0.18);

    const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 100);
    camera.position.set(0, 2.2, 4.5);
    camera.lookAt(0, 0.2, 0);

    // Iluminacion
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const keyLight = new THREE.DirectionalLight(0x00e5a0, 0.9);
    keyLight.position.set(4, 8, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x0096ff, 0.5);
    fillLight.position.set(-6, -2, -4);
    scene.add(fillLight);

    // Grilla de suelo
    const grid = new THREE.GridHelper(8, 16, 0x1c2330, 0x1c2330);
    grid.position.y = -1.2;
    scene.add(grid);

    // Materiales
    const matArm = new THREE.MeshPhongMaterial({
      color: 0x00e5a0, transparent: true, opacity: 0.82, shininess: 90,
    });
    const matHand = new THREE.MeshPhongMaterial({
      color: 0x00e5a0, transparent: true, opacity: 0.88, shininess: 90,
    });
    const matWire = new THREE.LineBasicMaterial({
      color: 0x00e5a0, transparent: true, opacity: 0.25,
    });
    const matChip = new THREE.MeshPhongMaterial({
      color: 0x0096ff, emissive: 0x002244, shininess: 120,
    });

    // Grupo principal — rota con roll/pitch
    const arm = new THREE.Group();
    scene.add(arm);

    // Antebrazo
    const geoForearm = new THREE.BoxGeometry(0.38, 0.22, 1.6);
    arm.add(new THREE.Mesh(geoForearm, matArm));
    arm.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoForearm), matWire));

    // Mano
    const geoHand = new THREE.BoxGeometry(0.55, 0.17, 0.58);
    const hand = new THREE.Mesh(geoHand, matHand);
    hand.position.set(0, 0, -1.08);
    arm.add(hand);
    arm.add(Object.assign(
      new THREE.LineSegments(new THREE.EdgesGeometry(geoHand), matWire),
      { position: hand.position.clone() }
    ));

    // Chip MPU6050 (representacion visual)
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.18), matChip);
    chip.position.set(0, 0.14, 0.1);
    arm.add(chip);

    // Ejes de coordenadas
    arm.add(new THREE.AxesHelper(0.9));

    // Estado expuesto al dashboard
    window.arm3d = {
      roll: 0,
      pitch: 0,
      tremorActive: false,
      _phase: 0,
      setSensor: function (active) {
        const c = active ? 0xff4757 : 0x00e5a0;
        matArm.color.setHex(c);
        matHand.color.setHex(c);
        matWire.color.setHex(c);
      }
    };

    // Redimensionar
    function resize() {
      const w = canvas.clientWidth || 600;
      const h = canvas.clientHeight || 280;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    new ResizeObserver(resize).observe(canvas);

    // Loop de animacion
    (function animate() {
      requestAnimationFrame(animate);
      const s = window.arm3d;
      const roll  = s.roll  * Math.PI / 180;
      const pitch = s.pitch * Math.PI / 180;

      // Interpolacion suave hacia el angulo objetivo
      arm.rotation.z = THREE.MathUtils.lerp(arm.rotation.z, roll,  0.08);
      arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, pitch, 0.08);

      // Efecto visual de tremor
      if (s.tremorActive) {
        s._phase += 0.35;
        arm.rotation.z += Math.sin(s._phase * 5.1) * 0.045;
        arm.rotation.x += Math.cos(s._phase * 4.8) * 0.032;
      }

      renderer.render(scene, camera);
    })();
  })();
