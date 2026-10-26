// Ефекти: іскри, жар, пил, душі вибулих, ударні хвилі, спалахи удару, шлейфи зброї.
import * as THREE from "./vendor/three.module.min.js";

const VERT = `
attribute float size; attribute float alpha; attribute vec3 tint;
varying float vA; varying vec3 vC;
uniform float uScale;
void main() {
  vA = alpha; vC = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vA; varying vec3 vC;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  if (a * vA < 0.003) discard;
  gl_FragColor = vec4(vC, a * vA);
}`;

/** CPU-driven point particles; one draw call per system. */
export class Particles {
  constructor(scene, cap, additive) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.c = new Float32Array(cap * 3);
    this.s = new Float32Array(cap); this.a = new Float32Array(cap);
    this.life = new Float32Array(cap); this.age = new Float32Array(cap); this.s0 = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.grav = new Float32Array(cap); this.kind = new Uint8Array(cap); this.ph = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.ap = new THREE.BufferAttribute(this.p, 3); this.ap.setUsage(THREE.DynamicDrawUsage);
    this.ac = new THREE.BufferAttribute(this.c, 3); this.ac.setUsage(THREE.DynamicDrawUsage);
    this.as = new THREE.BufferAttribute(this.s, 1); this.as.setUsage(THREE.DynamicDrawUsage);
    this.aa = new THREE.BufferAttribute(this.a, 1); this.aa.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.ap); g.setAttribute("tint", this.ac); g.setAttribute("size", this.as); g.setAttribute("alpha", this.aa);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 500 } },
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 5 : 4;
    g.setDrawRange(0, 0);
    scene.add(this.pts);
  }
  /** kind: 0 plain, 1 soul (sways, grows), 2 ember (flickers) */
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, drag = 0, grav = 0, kind = 0) {
    let i = this.n;
    if (i >= this.cap) { i = (Math.random() * this.cap) | 0; } else this.n++;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
    this.life[i] = life; this.age[i] = 0; this.s0[i] = size; this.s[i] = size; this.a[i] = 1;
    this.drag[i] = drag; this.grav[i] = grav; this.kind[i] = kind; this.ph[i] = Math.random() * 6.28;
  }
  update(dt) {
    const { p, v, c, s, a } = this;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const u = this.age[i] / this.life[i];
      if (u >= 1) { this.kill(i); i--; continue; }
      const k = this.kind[i], dr = Math.exp(-this.drag[i] * dt);
      v[i * 3] *= dr; v[i * 3 + 1] = v[i * 3 + 1] * dr - this.grav[i] * dt; v[i * 3 + 2] *= dr;
      let sx = 0, sz = 0;
      if (k === 1) { const w = this.age[i] * 2.4 + this.ph[i]; sx = Math.sin(w) * 0.5 * dt; sz = Math.cos(w * 0.8) * 0.5 * dt; }
      p[i * 3] += v[i * 3] * dt + sx; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt + sz;
      if (k === 1) { s[i] = this.s0[i] * (0.6 + u * 0.8); a[i] = Math.sin(Math.PI * Math.min(1, u * 1.3)) * 0.9; }
      else if (k === 2) { s[i] = this.s0[i]; a[i] = (1 - u) * (0.6 + 0.4 * Math.sin(this.age[i] * 19 + this.ph[i])); }
      else { s[i] = this.s0[i] * (1 - u * 0.5); a[i] = 1 - u * u; }
    }
    this.pts.geometry.setDrawRange(0, this.n);
    this.ap.needsUpdate = this.ac.needsUpdate = this.as.needsUpdate = this.aa.needsUpdate = true;
    void c;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const arr of [this.p, this.v, this.c]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
    for (const arr of [this.s, this.a, this.life, this.age, this.s0, this.drag, this.grav, this.kind, this.ph]) arr[i] = arr[j];
  }
  clear() { this.n = 0; this.pts.geometry.setDrawRange(0, 0); }
}

function radialTex(stops) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const x = cv.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export const glowTex = () => radialTex([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.5)"], [0.6, "rgba(255,255,255,0.1)"], [1, "rgba(255,255,255,0)"]]);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.add = new Particles(scene, 5000, true);
    this.dust = new Particles(scene, 1500, false);
    this.glow = glowTex();
    // ground shock rings
    this.rings = [];
    const rg = new THREE.RingGeometry(0.82, 1, 64); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.visible = false; m.renderOrder = 6; scene.add(m); this.rings.push({ m, t: 1, dur: 1, r0: 1, r1: 1 });
    }
    // hit flashes
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0xffd0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      s.visible = false; s.renderOrder = 7; scene.add(s); this.flashes.push({ s, t: 1, dur: 0.15, size: 1 });
    }
    // magic orbs (staff casts)
    this.orbs = [];
  }
  ring(x, y, z, r1, color = 0xffa050, dur = 0.7, op = 0.9) {
    const r = this.rings.find((q) => q.t >= q.dur) || this.rings[0];
    r.t = 0; r.dur = dur; r.r1 = r1; r.op = op; r.m.material.color.set(color); r.m.position.set(x, y + 0.06, z); r.m.visible = true;
  }
  flash(x, y, z, size = 1.6, color = 0xffd0a0, dur = 0.16) {
    const f = this.flashes.find((q) => q.t >= q.dur) || this.flashes[0];
    f.t = 0; f.dur = dur; f.size = size; f.s.material.color.set(color); f.s.position.set(x, y, z); f.s.visible = true;
  }
  sparks(x, y, z, n, color = [2.4, 1.3, 0.5], spd = 7, dir = null) {
    for (let i = 0; i < n; i++) {
      let vx = (Math.random() - 0.5) * 2, vy = Math.random() * 1.4 - 0.2, vz = (Math.random() - 0.5) * 2;
      if (dir) { vx += dir.x * 1.6; vz += dir.z * 1.6; }
      const k = spd * (0.4 + Math.random() * 0.8);
      this.add.spawn(x, y, z, vx * k, vy * k, vz * k, 0.25 + Math.random() * 0.35, 0.05 + Math.random() * 0.05, color[0], color[1], color[2], 2.5, 14);
    }
  }
  /** Spirit leaving a knocked-out fighter: a column of rising wisps. */
  soul(x, y, z, color = [0.5, 1.2, 0.6]) {
    for (let i = 0; i < 26; i++) {
      this.add.spawn(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.5, 0, 1.2 + Math.random() * 1.6, 0,
        1.4 + Math.random() * 1.2, 0.35 + Math.random() * 0.35, color[0], color[1], color[2], 0.3, -0.4, 1);
    }
  }
  puff(x, y, z, n = 14, size = 0.9, spd = 2.5, col = [0.32, 0.3, 0.3]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, k = spd * (0.4 + Math.random() * 0.8);
      this.dust.spawn(x, y + Math.random() * 0.3, z, Math.cos(a) * k, Math.random() * 1.2, Math.sin(a) * k, 0.7 + Math.random() * 0.7, size * (0.6 + Math.random() * 0.8), col[0], col[1], col[2], 2.2, -0.3);
    }
  }
  ember(x, y, z, r = 1.0, g = 0.45, b = 0.12) {
    this.add.spawn(x, y, z, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.9, (Math.random() - 0.5) * 0.6, 1.6 + Math.random() * 1.8, 0.08 + Math.random() * 0.08, r, g, b, 0.5, -0.1, 2);
  }
  /** A glowing orb from a staff, flies `dur` seconds and calls onHit. */
  orb(from, to, dur, color, onHit) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(0.9); s.renderOrder = 7; this.scene.add(s);
    this.orbs.push({ s, from: from.clone(), to: to.clone(), t: 0, dur, onHit, color: new THREE.Color(color) });
  }
  update(dt, camera) {
    this.add.update(dt); this.dust.update(dt);
    for (const r of this.rings) {
      if (r.t >= r.dur) continue;
      r.t += dt; const u = Math.min(1, r.t / r.dur);
      const e = 1 - (1 - u) ** 3;
      r.m.scale.setScalar(0.2 + r.r1 * e); r.m.material.opacity = (1 - u) * r.op;
      if (u >= 1) r.m.visible = false;
    }
    for (const f of this.flashes) {
      if (f.t >= f.dur) continue;
      f.t += dt; const u = Math.min(1, f.t / f.dur);
      f.s.scale.setScalar(f.size * (0.6 + u * 0.8)); f.s.material.opacity = 1 - u;
      if (u >= 1) f.s.visible = false;
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]; o.t += dt; const u = Math.min(1, o.t / o.dur);
      o.s.position.lerpVectors(o.from, o.to, u); o.s.position.y += Math.sin(u * Math.PI) * 0.4;
      const c = o.color;
      for (let k = 0; k < 2; k++) this.add.spawn(o.s.position.x, o.s.position.y, o.s.position.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.35, 0.18, c.r * 2, c.g * 2, c.b * 2, 1, 0);
      if (u >= 1) { this.scene.remove(o.s); o.s.material.dispose(); this.orbs.splice(i, 1); o.onHit?.(); }
    }
    if (camera) {
      const h = camera.userData.bufH || 1080;
      const sc = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
      this.add.mat.uniforms.uScale.value = sc; this.dust.mat.uniforms.uScale.value = sc;
    }
  }
  clear() {
    this.add.clear(); this.dust.clear();
    for (const r of this.rings) { r.t = r.dur; r.m.visible = false; }
    for (const f of this.flashes) { f.t = f.dur; f.s.visible = false; }
    for (const o of this.orbs) { this.scene.remove(o.s); o.s.material.dispose(); }
    this.orbs.length = 0;
  }
}

/** Ribbon behind a weapon tip: the last N positions of the blade (base→tip). */
export class Trail {
  constructor(scene, color, n = 14) {
    this.n = n; this.pos = new Float32Array(n * 2 * 3); this.al = new Float32Array(n * 2);
    const g = new THREE.BufferGeometry();
    this.ap = new THREE.BufferAttribute(this.pos, 3); this.ap.setUsage(THREE.DynamicDrawUsage);
    this.aa = new THREE.BufferAttribute(this.al, 1); this.aa.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.ap); g.setAttribute("alpha", this.aa);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: 0 } },
      vertexShader: "attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uColor; uniform float uOp; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * uOp); }",
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.on = false; this.op = 0; this.filled = false;
  }
  push(base, tip, active, dt) {
    const p = this.pos, n = this.n;
    if (!this.filled || (!active && this.op <= 0.01)) {
      for (let i = 0; i < n; i++) { p.set([base.x, base.y, base.z], i * 6); p.set([tip.x, tip.y, tip.z], i * 6 + 3); }
      this.filled = true;
    } else {
      p.copyWithin(6, 0, (n - 1) * 6);
      p[0] = base.x; p[1] = base.y; p[2] = base.z; p[3] = tip.x; p[4] = tip.y; p[5] = tip.z;
    }
    for (let i = 0; i < n; i++) { const a = (1 - i / (n - 1)) ** 1.6; this.al[i * 2] = 0; this.al[i * 2 + 1] = a; }
    this.op += ((active ? 1 : 0) - this.op) * Math.min(1, dt * (active ? 30 : 9));
    this.mat.uniforms.uOp.value = this.op * 0.42;
    this.mesh.visible = this.op > 0.01;
    this.ap.needsUpdate = this.aa.needsUpdate = true;
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
