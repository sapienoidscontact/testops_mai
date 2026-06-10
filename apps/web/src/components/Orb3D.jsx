"use client";

import { useEffect, useRef } from "react";

// ─── 3D Value Noise (inline, no deps) ───────────────────────────────────────
const _h = (x, y, z) => {
  let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
};
const _n3 = (x, y, z) => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x-ix, fy = y-iy, fz = z-iz;
  const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy), uz = fz*fz*(3-2*fz);
  return (
    _h(ix,iy,iz)*(1-ux)*(1-uy)*(1-uz)   + _h(ix+1,iy,iz)*ux*(1-uy)*(1-uz) +
    _h(ix,iy+1,iz)*(1-ux)*uy*(1-uz)      + _h(ix+1,iy+1,iz)*ux*uy*(1-uz) +
    _h(ix,iy,iz+1)*(1-ux)*(1-uy)*uz      + _h(ix+1,iy,iz+1)*ux*(1-uy)*uz +
    _h(ix,iy+1,iz+1)*(1-ux)*uy*uz        + _h(ix+1,iy+1,iz+1)*ux*uy*uz
  ) * 2 - 1;
};
const fbm = (x, y, z) =>
  _n3(x,y,z)*0.5 + _n3(x*2.1+1.7,y*2.1+9.2,z*2.1+3.1)*0.25 +
  _n3(x*4.2+8.3,y*4.2+2.8,z*4.2+5.1)*0.125 + _n3(x*8.4+3.7,y*8.4+7.4,z*8.4+1.9)*0.0625;

// ─── Palette: cyan-blue → indigo → violet → magenta ─────────────────────────
const PAL = [
  [0.00, 0.75, 1.00],
  [0.35, 0.00, 1.00],
  [0.75, 0.00, 0.90],
  [1.00, 0.00, 0.70],
];
function palAt(t) {
  t = Math.min(1, Math.max(0, t));
  const seg = t * (PAL.length - 1);
  const i = Math.min(PAL.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = PAL[i], b = PAL[i+1];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}

// ─── Component ───────────────────────────────────────────────────────────────
/**
 * Orb3D
 * fullscreen=true  → fixed, fills the entire viewport, used as page background
 * fullscreen=false → inline block at `size` × `size` px
 */
export default function Orb3D({ state = "idle", size = 300, fullscreen = false }) {
  const mountRef = useRef(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof window === "undefined") return;

    let active  = true;
    let rafId   = null;
    let cleanup = null;

    (async () => {
      const THREE = await import("three");
      if (!active) return;

      // ── Canvas dimensions ────────────────────────────────────────────────
      const getW = () => fullscreen ? window.innerWidth  : size;
      const getH = () => fullscreen ? window.innerHeight : size;
      let W = getW(), H = getH();

      // ── Renderer ─────────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
      // Pull back slightly for fullscreen so orb doesn't overpower the whole screen
      camera.position.z = fullscreen ? 4.0 : 3.2;

      // Resize handler (fullscreen only)
      const onResize = () => {
        W = getW(); H = getH();
        renderer.setSize(W, H);
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
      };
      if (fullscreen) window.addEventListener("resize", onResize);

      // ── Wireframe sphere ─────────────────────────────────────────────────
      const SEGS   = 52;
      const geo    = new THREE.SphereGeometry(1, SEGS, SEGS);
      const posArr = geo.attributes.position.array;
      const vCount = geo.attributes.position.count;

      const dirs = new Float32Array(vCount * 3);
      for (let i = 0; i < vCount; i++) {
        const x = posArr[i*3], y = posArr[i*3+1], z = posArr[i*3+2];
        const l = Math.sqrt(x*x+y*y+z*z)||1;
        dirs[i*3]=x/l; dirs[i*3+1]=y/l; dirs[i*3+2]=z/l;
      }

      const colArr = new Float32Array(vCount * 3);
      geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));

      const wireMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, wireframe: true, transparent: true,
        opacity: fullscreen ? 0.42 : 0.50,
      }));
      scene.add(wireMesh);

      // Outer halo copy
      const geoH = geo.clone();
      geoH.setAttribute("color", new THREE.BufferAttribute(new Float32Array(vCount*3), 3));
      const haloMesh = new THREE.Mesh(geoH, new THREE.MeshBasicMaterial({
        vertexColors: true, wireframe: true, transparent: true,
        opacity: fullscreen ? 0.08 : 0.10,
      }));
      haloMesh.scale.setScalar(1.065);
      scene.add(haloMesh);

      // ── Orbital rings ────────────────────────────────────────────────────
      function makeRing(r, tiltX, tiltZ, color, opacity) {
        const pts = [];
        for (let i = 0; i <= 160; i++) {
          const a = (i / 160) * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a)*r, Math.sin(a)*r, 0));
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity })
        );
        line.rotation.x = tiltX;
        line.rotation.z = tiltZ;
        return line;
      }

      const ring1 = makeRing(1.14, Math.PI*0.18, 0,            0x44aaff, 0.55);
      const ring2 = makeRing(1.10, Math.PI*0.55, Math.PI*0.30, 0xaa44ff, 0.45);
      const ring3 = makeRing(1.07, Math.PI*0.80, Math.PI*0.65, 0xff44cc, 0.38);
      const rings = [ring1, ring2, ring3];
      rings.forEach(r => scene.add(r));

      // Scan-line arc
      const scanPts = [];
      for (let i = 0; i <= 80; i++) {
        const a = (i / 80) * Math.PI * 0.6 - Math.PI * 0.3;
        scanPts.push(new THREE.Vector3(Math.cos(a)*1.16, Math.sin(a)*1.16, 0));
      }
      const scanLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(scanPts),
        new THREE.LineBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 0 })
      );
      scene.add(scanLine);

      // ── Particles ────────────────────────────────────────────────────────
      function makeParticles(count, rMin, rMax, dotSize, opacity) {
        const pPos = new Float32Array(count*3), pCol = new Float32Array(count*3);
        for (let i = 0; i < count; i++) {
          const θ = Math.random()*Math.PI*2, φ = Math.acos(2*Math.random()-1);
          const r = rMin + Math.pow(Math.random(), 0.55) * (rMax-rMin);
          pPos[i*3]   = r*Math.sin(φ)*Math.cos(θ);
          pPos[i*3+1] = r*Math.sin(φ)*Math.sin(θ);
          pPos[i*3+2] = r*Math.cos(φ);
          const [cr,cg,cb] = palAt(Math.random());
          pCol[i*3]=cr; pCol[i*3+1]=cg; pCol[i*3+2]=cb;
        }
        const pg = new THREE.BufferGeometry();
        pg.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
        pg.setAttribute("color",    new THREE.BufferAttribute(pCol, 3));
        return new THREE.Points(pg, new THREE.PointsMaterial({
          vertexColors: true, size: dotSize, transparent: true, opacity, sizeAttenuation: true,
        }));
      }

      const ptCloud1 = makeParticles(850, 1.06, 1.90, 0.021, 0.85);
      const ptCloud2 = makeParticles(200, 1.60, 2.50, 0.038, 0.65);
      scene.add(ptCloud1);
      scene.add(ptCloud2);

      // ── Ripple system ────────────────────────────────────────────────────
      let ripples = [];
      let time = 0;

      function spawnRipple(strength = 1.0) {
        const θ = Math.random()*Math.PI*2, φ = Math.acos(2*Math.random()-1);
        ripples.push({
          ox: Math.sin(φ)*Math.cos(θ), oy: Math.cos(φ), oz: Math.sin(φ)*Math.sin(θ),
          birth: time,
          strength: (0.04 + Math.random()*0.07) * strength,
          speed:    1.4 + Math.random()*0.8,
        });
      }
      spawnRipple(1.0);

      const ringState = [
        { base: 0, speed: 0.008, axis: "y" },
        { base: 0, speed: 0.011, axis: "z" },
        { base: 0, speed: 0.006, axis: "x" },
      ];

      const pos = geo.attributes.position;
      const posH = geoH.attributes.position;
      const colH = geoH.attributes.color;
      let lastRipple = 0, scanAngle = 0;

      // ── Animation loop ────────────────────────────────────────────────────
      const loop = () => {
        if (!active) return;
        rafId = requestAnimationFrame(loop);

        const s = stateRef.current;
        const isIdle = s==="idle", isListening = s==="listening",
              isThinking = s==="thinking", isSpeaking = s==="speaking";

        const dt         = isIdle?0.0030 : isListening?0.0070 : isThinking?0.0160 : 0.0100;
        const deformBase = isIdle?0.18   : isListening?0.26   : isThinking?0.42   : 0.30;
        const rotSpd     = isIdle?0.0018 : isListening?0.0040 : isThinking?0.0120 : 0.0055;
        const ringSpd    = isIdle?1.0    : isListening?2.0    : isThinking?4.5    : 2.5;
        const rippleFreq = isIdle?2.2    : isListening?1.0    : isThinking?0.35   : 0.55;

        time += dt;

        const wobX = isThinking ? Math.sin(time*3.1)*0.008 : isListening ? Math.sin(time*5)*0.003 : 0;
        const wobZ = isThinking ? Math.cos(time*2.7)*0.006 : 0;

        wireMesh.rotation.y += rotSpd + Math.sin(time*0.7)*rotSpd*0.3;
        wireMesh.rotation.x += rotSpd*0.22 + wobX;
        wireMesh.rotation.z += wobZ;
        haloMesh.rotation.copy(wireMesh.rotation);
        ptCloud1.rotation.y -= rotSpd*0.5;
        ptCloud1.rotation.x += rotSpd*0.12;
        ptCloud2.rotation.y += rotSpd*0.28;

        rings.forEach((ring, idx) => {
          const rs = ringState[idx];
          rs.base += rs.speed * ringSpd;
          ring.rotation[rs.axis] = rs.base;
          if (isThinking) {
            ring.rotation[rs.axis==="y"?"x":"y"] = Math.sin(time*(1.2+idx*0.4))*0.4;
          }
          const p = 0.3 + Math.sin(time*3 + idx*2)*0.15;
          ring.material.opacity = isThinking ? p+0.2 : isIdle ? p*0.7 : p;
        });

        scanAngle += isThinking?0.055 : isSpeaking?0.035 : 0.012;
        scanLine.rotation.y = scanAngle;
        scanLine.rotation.x = Math.sin(time*1.4)*0.5;
        scanLine.material.opacity = isThinking ? 0.35+Math.sin(time*8)*0.25
          : isSpeaking ? 0.20+Math.sin(time*12)*0.15
          : 0.08+Math.sin(time*2)*0.05;

        if (time - lastRipple > rippleFreq) {
          spawnRipple(isThinking?2.0 : isSpeaking?1.5 : 1.0);
          if (isThinking && Math.random()<0.5) spawnRipple(1.8);
          lastRipple = time;
        }
        ripples = ripples.filter(r => (time - r.birth) < 2.8);

        for (let i = 0; i < vCount; i++) {
          const nx=dirs[i*3], ny=dirs[i*3+1], nz=dirs[i*3+2];
          let noise      = fbm(nx*1.9+time, ny*1.9+time*0.65, nz*1.9+time*0.42);
          const fastNoise = _n3(nx*4+time*3.1, ny*4+time*2.7, nz*4+time*1.9)*0.06;

          let rippleDisp = 0;
          for (const rp of ripples) {
            const age  = time - rp.birth;
            const dist = Math.acos(Math.min(1, Math.max(-1, nx*rp.ox+ny*rp.oy+nz*rp.oz)));
            const env  = Math.exp(-Math.pow(dist - age*rp.speed, 2)/0.35) * Math.exp(-age*1.2);
            rippleDisp += env * rp.strength * Math.sin((dist - age*rp.speed)*18);
          }

          const pFreq = isThinking?12 : isSpeaking?9 : 4;
          const pAmp  = isThinking?0.045 : isSpeaking?0.032 : 0.012;
          const dataPulse = Math.sin(nx*3.2+ny*2.1+nz*4.5+time*pFreq)*pAmp;
          const polar = isThinking ? Math.abs(ny)*Math.sin(time*18)*0.04 : 0;

          const r = 1.0 + noise*(deformBase+(isThinking?Math.abs(noise)*0.1:0))
            + fastNoise + rippleDisp + dataPulse + polar;

          pos.setXYZ(i, nx*r, ny*r, nz*r);

          const t = Math.min(1, Math.max(0, ((nx+1)-ny)*0.5 + noise*0.22 + rippleDisp*2));
          const [cr,cg,cb] = palAt(t);
          const bright = (0.55+Math.abs(noise)*1.0) * (1+Math.abs(rippleDisp)*12) * (1+Math.abs(dataPulse)*8);

          colArr[i*3]   = Math.min(1.8, cr*bright);
          colArr[i*3+1] = Math.min(1.8, cg*bright);
          colArr[i*3+2] = Math.min(1.8, cb*bright);

          posH.setXYZ(i, nx*r, ny*r, nz*r);
          colH.array[i*3]=colArr[i*3]*0.4; colH.array[i*3+1]=colArr[i*3+1]*0.4; colH.array[i*3+2]=colArr[i*3+2]*0.4;
        }

        pos.needsUpdate=true; geo.attributes.color.needsUpdate=true;
        posH.needsUpdate=true; geoH.attributes.color.needsUpdate=true;

        const breathe = 1+Math.sin(time*3.5)*0.006;
        const pulse = isSpeaking  ? 1+Math.sin(time*20)*0.028
                    : isListening ? 1+Math.sin(time*13)*0.022
                    : isThinking  ? 1+Math.sin(time*7)*0.015
                    : breathe;
        wireMesh.scale.setScalar(pulse);
        haloMesh.scale.setScalar(pulse*1.065);

        renderer.render(scene, camera);
      };

      rafId = requestAnimationFrame(loop);

      cleanup = () => {
        if (fullscreen) window.removeEventListener("resize", onResize);
        renderer.dispose();
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      };
    })();

    return () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      cleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen, size]);

  // ── Fullscreen layout ────────────────────────────────────────────────────
  if (fullscreen) {
    return (
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {/* Ambient deep glow */}
        <div style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(100,0,200,0.18) 0%, rgba(0,0,30,0) 65%)",
          pointerEvents: "none",
        }} />
        {/* Three.js mount */}
        <div ref={mountRef} style={{
          position: "absolute", inset: 0,
          filter:
            "drop-shadow(0 0 8px rgba(0,160,255,0.50))" +
            " drop-shadow(0 0 22px rgba(140,0,255,0.40))" +
            " drop-shadow(0 0 45px rgba(200,0,180,0.28))",
        }} />
      </div>
    );
  }

  // ── Compact layout (original small-orb mode) ─────────────────────────────
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div style={{
        position: "absolute", inset: "5%", borderRadius: "50%",
        background: "radial-gradient(ellipse at 38% 42%, rgba(160,0,255,0.30) 0%, rgba(0,80,255,0.15) 45%, transparent 70%)",
        filter: "blur(30px)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", inset: "20%", borderRadius: "50%",
        background: "radial-gradient(ellipse at 66% 68%, rgba(255,0,180,0.24) 0%, transparent 58%)",
        filter: "blur(20px)", pointerEvents: "none",
      }} />
      <div ref={mountRef} style={{
        position: "absolute", inset: 0,
        filter:
          "drop-shadow(0 0 5px rgba(0,160,255,0.60))" +
          " drop-shadow(0 0 16px rgba(140,0,255,0.48))" +
          " drop-shadow(0 0 32px rgba(200,0,180,0.32))",
      }} />
    </div>
  );
}
