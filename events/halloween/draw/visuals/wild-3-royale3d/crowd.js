// Натовп: усі учасники, крім «героїв» на екрані, — маленькі гарбузові фігурки одним інстанс-мешем.
// Тримає 2000+ без гальм. Хто з більшою кількістю квитків — трохи більший і з кільцем під ногами.
import * as THREE from "./vendor/three.module.min.js";
import { faceTex, factionOf, merge } from "./fighter.js";
import { tex } from "./tex.js";

const FAC_COL = { pumpkins: new THREE.Color(0x6a3a1c), orders: new THREE.Color(0x2f4d28), both: new THREE.Color(0x3e2d62) };
const RING_COL = { pumpkins: new THREE.Color(1.3, 0.55, 0.15), orders: new THREE.Color(0.45, 1.2, 0.35), both: new THREE.Color(0.8, 0.45, 1.5) };
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export class Crowd {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.cap = 0; this.list = []; this.byId = new Map();
    // robe with a flared hem, sleeves hanging along it, a collar and the stem (one draw call)
    const robe = new THREE.CylinderGeometry(0.13, 0.32, 0.95, 10, 3);
    { const p = robe.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.4) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.08 * Math.sin(a * 5); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } } robe.computeVertexNormals(); }
    robe.translate(0, 0.48, 0);
    const sleeve = (sx) => { const g = new THREE.CapsuleGeometry(0.065, 0.36, 3, 6); g.rotateZ(sx * 0.32); g.translate(sx * 0.24, 0.6, 0.02); return g; };
    const hand = (sx) => { const g = new THREE.SphereGeometry(0.06, 6, 4); g.translate(sx * 0.31, 0.38, 0.05); return g; };
    const collar = new THREE.TorusGeometry(0.15, 0.045, 5, 12); collar.rotateX(Math.PI / 2); collar.translate(0, 0.95, 0);
    const stem = new THREE.CylinderGeometry(0.02, 0.035, 0.1, 5); stem.rotateZ(0.25); stem.translate(-0.01, 1.35, 0);
    const leaf = new THREE.SphereGeometry(0.055, 6, 3); leaf.scale(1, 0.2, 0.5); leaf.rotateZ(-0.3); leaf.translate(0.06, 1.32, 0.01);
    const body = merge([robe, sleeve(1), sleeve(-1), hand(1), hand(-1), collar, stem, leaf]);
    const head = new THREE.SphereGeometry(0.22, 16, 10);
    { const p = head.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x), rb = 0.5 - 0.5 * Math.cos(a * 8), l = 1 - 0.11 * rb * Math.sqrt(rb); p.setXYZ(i, v.x * l * 1.12, v.y * 0.84, v.z * l * 1.12); } head.computeVertexNormals(); }
    head.translate(0, 1.14, 0);
    // a witch hat on some of them
    const hat = merge([(() => { const g = new THREE.ConeGeometry(0.17, 0.4, 8, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.1) p.setX(i, p.getX(i) - (y - 0.1) * 0.35); } g.computeVertexNormals(); g.translate(0, 1.5, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14); g.translate(0, 1.3, 0); return g; })()]);
    const ring = new THREE.RingGeometry(0.42, 0.55, 24); ring.rotateX(-Math.PI / 2); ring.translate(0, 0.06, 0);
    this.geo = { body, head, ring, hat };
    this.mHat = new THREE.MeshStandardMaterial({ color: 0x17141c, roughness: 0.85, flatShading: true });
    this.mBody = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true, map: tex("cloth") });
    this.mHead = new THREE.MeshStandardMaterial({ color: 0xc0601e, roughness: 0.65, map: tex("pumpkin"), emissive: 0xffa040, emissiveIntensity: 2.0, emissiveMap: faceTex(1) });
    this.mRing = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  alloc(n) {
    if (n <= this.cap && this.bodies) return;
    for (const m of [this.bodies, this.heads, this.rings, this.hats]) if (m) { this.scene.remove(m); m.dispose(); }
    this.cap = Math.max(64, Math.ceil(n * 1.25));
    this.bodies = new THREE.InstancedMesh(this.geo.body, this.mBody, this.cap);
    this.heads = new THREE.InstancedMesh(this.geo.head, this.mHead, this.cap);
    this.rings = new THREE.InstancedMesh(this.geo.ring, this.mRing, this.cap);
    this.hats = new THREE.InstancedMesh(this.geo.hat, this.mHat, this.cap);
    for (const m of [this.bodies, this.heads, this.rings, this.hats]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; this.scene.add(m); }
    this.bodies.receiveShadow = true;
    this.rings.renderOrder = 2;
  }
  /** people: participants (not heroes); place(p) → {x, z} */
  set(people, place, ground) {
    this.ground = ground;
    const old = this.byId; this.byId = new Map(); this.list = [];
    this.alloc(people.length);
    const c = new THREE.Color();
    let ri = 0, hi = 0;
    for (const p of people) {
      let d = old.get(p.id);
      if (!d) {
        const h = h32(p.id), pos = place(p);
        d = { id: p.id, x: pos.x, z: pos.z, yaw: ((h >>> 4) % 628) / 100, ph: ((h >>> 9) % 628) / 100, alive: true, dieAt: Infinity, out: 0, kind: 0 };
      }
      d.p = p; d.tier = Math.min(3, Math.floor(Math.log2(Math.max(1, p.tickets || 1)))); d.fac = factionOf(p);
      d.y = ground(d.x, d.z);
      d.i = this.list.length; this.list.push(d); this.byId.set(p.id, d);
      c.copy(FAC_COL[d.fac]).multiplyScalar(0.8 + ((h32(p.id) >>> 3) % 40) / 100);
      this.bodies.setColorAt(d.i, c);
      this.heads.setColorAt(d.i, c.setRGB(1, 1, 1));
      d.hi = (h32(p.id) >>> 12) % 3 === 0 ? hi++ : -1;
      if (d.tier > 0) { d.ri = ri; this.rings.setColorAt(ri++, RING_COL[d.fac]); } else d.ri = -1;
    }
    this.ringCount = ri;
    this.bodies.count = this.heads.count = this.list.length; this.rings.count = ri; this.hats.count = hi;
    for (const m of [this.bodies, this.heads, this.rings]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  revive() { for (const d of this.list) { d.alive = true; d.dieAt = Infinity; d.out = 0; d.drop = 0; } }
  get aliveCount() { let n = 0; for (const d of this.list) if (d.alive) n++; return n; }
  /** kind 0 — knocked out in a skirmish (orange), 1 — the storm (violet) */
  kill(d, kind, quiet) {
    if (!d.alive) return;
    d.alive = false; d.out = 0.001; d.kind = kind;
    if (quiet) return;
    const y = d.y + 1.0;
    if (kind === 1) { this.fx.add.spawn(d.x, y, d.z, 0, 0.5, 0, 0.5, 1.2, 1.0, 0.45, 1.5, 1, 0); this.fx.soul(d.x, d.y + 0.4, d.z, [0.75, 0.4, 1.3]); }
    else { this.fx.sparks(d.x, y, d.z, 10, [2.2, 1.1, 0.4], 4); this.fx.soul(d.x, d.y + 0.4, d.z); }
  }
  update(t, dt, cam) {
    const { m4, q, e, v, s } = this;
    for (const d of this.list) {
      let k = 1 + d.tier * 0.12, y = d.y;
      const fall = (d.drop || 0) - t; // still falling from the sky at the start of a roll
      if (fall > 0) y += fall * fall * 14;
      if (!d.alive) {
        if (d.out > 0) { d.out += dt; k *= Math.max(0, 1 - d.out / 0.35); y += d.out * 1.5; }
        if (d.out > 0.35 || d.out === 0) k = 0;
      }
      const b = Math.sin(t * 2.2 + d.ph);
      e.set(0, d.yaw + Math.sin(t * 0.5 + d.ph) * 0.4, b * 0.04); q.setFromEuler(e);
      s.setScalar(k);
      m4.compose(v.set(d.x, y + Math.max(0, b) * 0.05, d.z), q, s);
      this.bodies.setMatrixAt(d.i, m4); this.heads.setMatrixAt(d.i, m4);
      if (d.hi >= 0) this.hats.setMatrixAt(d.hi, m4);
      if (d.ri >= 0) {
        s.setScalar(k > 0 ? (1 + d.tier * 0.25) * (1 + 0.06 * Math.sin(t * 3 + d.ph)) : 0);
        m4.compose(v.set(d.x, d.y, d.z), q.identity(), s); this.rings.setMatrixAt(d.ri, m4);
      }
    }
    this.bodies.instanceMatrix.needsUpdate = this.heads.instanceMatrix.needsUpdate = this.rings.instanceMatrix.needsUpdate = this.hats.instanceMatrix.needsUpdate = true;
    void cam;
  }
  dispose() { for (const m of [this.bodies, this.heads, this.rings, this.hats]) if (m) { this.scene.remove(m); m.dispose(); } }
}
