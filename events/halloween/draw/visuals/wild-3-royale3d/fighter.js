// Гарбузовий боєць: скелет із простих форм (без моделей-файлів), пози й удари задані ключовими кадрами.
// Персонаж дивиться вздовж +Z, права рука на -X. Кути в радіанах, порядок обертань YXZ.
import * as THREE from "./vendor/three.module.min.js";
import { Trail } from "./fx.js";

export const CH = ["hx", "hy", "hz", "sx", "sy", "sz", "nx", "ny", "nz", "lax", "lay", "laz", "lex", "rax", "ray", "raz", "rex", "wx", "wy", "wz",
  "llx", "lly", "llz", "lkx", "rlx", "rly", "rlz", "rkx", "ry", "rz", "yaw"];
const NC = CH.length;
const I = Object.fromEntries(CH.map((c, i) => [c, i]));
const pose = (o) => { const a = new Float32Array(NC); for (const k in o) a[I[k]] = o[k]; return a; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (u) => u * u * (3 - 2 * u);
const EASE = { io: smooth, out: (u) => 1 - (1 - u) ** 3, in: (u) => u * u * u, lin: (u) => u };

// ---------- poses ----------
const G = { sx: 0.12, sy: -0.32, nx: -0.04, ny: 0.3, lax: -0.75, laz: 0.18, lex: -1.55, rax: -0.55, raz: -0.22, rex: -1.25, wx: 0.75,
  llx: -0.38, lkx: 0.38, rlx: 0.3, rkx: 0.32, lly: 0.15, rly: -0.25, ry: -0.06 };
const RELAX = { sx: 0.04, nx: 0.02, lax: 0.08, laz: 0.14, lex: -0.25, rax: 0.1, raz: -0.16, rex: -0.55, wx: 0.95, llx: -0.04, rlx: 0.04, rkx: 0.04, lkx: 0.04 };
const BLOCK = { ...G, sx: 0.02, sy: -0.1, ny: 0.1, rax: -1.15, ray: 0.75, raz: 0, rex: -1.05, wx: 0.2, wy: 0.0, lax: -1.05, laz: 0.1, lex: -1.7, ry: -0.13, nx: 0.18 };
const DOWN = { hx: -1.5, ry: -0.74, sx: 0.0, nx: 0.35, ny: 0.4, lax: -0.3, laz: 1.25, lex: -0.4, rax: -0.2, raz: -1.15, rex: -0.3, wx: 0.6, llx: 0.12, rlx: -0.15, lkx: 0.25, rkx: 0.5, llz: 0.15, rlz: -0.12 };
const AIR = { hx: -0.7, sx: -0.25, nx: -0.4, lax: -2.4, laz: 0.6, lex: -0.5, rax: -2.2, raz: -0.6, rex: -0.4, wx: 0.6, llx: -0.6, lkx: 1.1, rlx: -0.2, rkx: 0.9 };
const VICTORY = { sx: -0.08, nx: -0.28, rax: -3.0, raz: -0.1, rex: -0.05, wx: 1.57, lax: -0.35, laz: 0.75, lex: -0.4, llx: -0.15, rlx: 0.15, lly: 0.2, rly: -0.2, lkx: 0.06, rkx: 0.06 };
const KNEEL = { sx: 0.42, nx: 0.25, ry: -0.42, llx: -1.35, lkx: 1.45, rlx: 0.35, rkx: 1.75, lax: -0.6, lex: -1.0, rax: 0.1, raz: -0.35, rex: -0.3, wx: 1.2 };

const K = (t, o, e = "io") => [t, pose({ ...G, ...o }), e];
const KA = (t, o, e = "io") => [t, pose(o), e];

/** Clips. hit = moment of contact, adv = [t0, t1, forward, side] committed root motion, trail = weapon-trail window. */
export const CLIPS = {
  slashR: { dur: 0.62, hit: 0.27, trail: [0.14, 0.42], adv: [0.1, 0.32, 0.38, 0], keys: [
    K(0, {}), K(0.15, { sy: -0.95, sx: 0.04, rax: -1.35, ray: -1.35, raz: -0.15, rex: -0.45, wx: 1.35, lax: -0.55, lex: -1.2, ny: 0.65, ry: -0.11, llx: -0.48, lkx: 0.5 }),
    K(0.29, { sy: 0.8, sx: 0.22, rax: -1.45, ray: 1.0, raz: 0, rex: -0.12, wx: 1.5, lax: -0.25, laz: 0.45, lex: -0.6, ny: -0.35, rz: 0.3, ry: -0.15, llx: -0.62, lkx: 0.62, rlx: 0.48 }, "out"),
    K(0.43, { sy: 0.95, sx: 0.18, ray: 1.35, rax: -1.1, rex: -0.4, wx: 1.25, rz: 0.25, ny: -0.3, ry: -0.13, llx: -0.55, lkx: 0.55 }), K(0.62, {})] },
  slashL: { dur: 0.58, hit: 0.25, trail: [0.13, 0.4], adv: [0.08, 0.3, 0.32, 0], keys: [
    K(0, {}), K(0.14, { sy: 0.55, rax: -1.4, ray: 1.25, raz: 0.1, rex: -1.1, wx: 1.25, ny: -0.2, lax: -0.4, lex: -0.9, ry: -0.1 }),
    K(0.27, { sy: -0.85, sx: 0.2, rax: -1.45, ray: -1.15, rex: -0.1, wx: 1.5, ny: 0.7, rz: 0.28, ry: -0.14, llx: -0.6, lkx: 0.6, lax: -0.2, laz: 0.6 }, "out"),
    K(0.4, { sy: -0.95, rax: -1.15, ray: -1.4, rex: -0.35, wx: 1.25, rz: 0.22, ny: 0.7 }), K(0.58, {})] },
  thrust: { dur: 0.58, hit: 0.26, trail: [0.16, 0.36], adv: [0.12, 0.3, 0.55, 0], keys: [
    K(0, {}), K(0.15, { sy: -0.65, rax: -1.05, ray: -0.35, rex: -1.95, wx: 1.62, lax: -1.2, lex: -0.6, ny: 0.55, ry: -0.12 }),
    K(0.27, { sy: 0.25, sx: 0.3, rax: -1.52, ray: 0.05, rex: 0, wx: 1.57, rz: 0.45, lax: 0.25, laz: 0.4, lex: -0.3, ry: -0.2, llx: -0.85, lkx: 0.75, rlx: 0.55, ny: 0.0 }, "out"),
    K(0.4, { sy: 0.2, sx: 0.25, rax: -1.45, rex: -0.1, wx: 1.5, rz: 0.4, ry: -0.18, llx: -0.8, lkx: 0.7, rlx: 0.5 }), K(0.58, {})] },
  overhead: { dur: 0.82, hit: 0.44, trail: [0.3, 0.55], adv: [0.28, 0.44, 0.4, 0], keys: [
    K(0, {}), K(0.28, { sx: -0.18, sy: -0.1, rax: -2.95, ray: 0.1, raz: -0.1, rex: -0.75, wx: 1.1, lax: -2.6, laz: 0.2, lex: -0.7, ry: 0.04, nx: -0.25, ny: 0.1, llx: -0.25, lkx: 0.2 }),
    K(0.45, { sx: 0.6, sy: -0.05, rax: -0.75, ray: 0.15, rex: -0.15, wx: 1.5, lax: -0.6, lex: -0.5, ry: -0.3, rz: 0.3, llx: -0.75, lkx: 0.95, rlx: 0.45, nx: 0.1, ny: 0.1 }, "out"),
    K(0.6, { sx: 0.55, rax: -0.65, rex: -0.2, wx: 1.45, ry: -0.28, rz: 0.28, llx: -0.72, lkx: 0.92, rlx: 0.45 }), K(0.82, {})] },
  kick: { dur: 0.62, hit: 0.27, adv: [0.1, 0.3, 0.3, 0], keys: [
    K(0, {}), K(0.14, { sx: -0.15, rlx: -1.35, rkx: 1.75, rly: 0, lkx: 0.22, llx: 0.1, ry: 0.0, rax: -0.3, raz: -0.6, lax: -0.4, laz: 0.6 }),
    K(0.27, { sx: -0.38, sy: -0.2, rlx: -1.55, rkx: 0.08, lkx: 0.3, llx: 0.18, ry: -0.02, rz: 0.2, rax: -0.2, raz: -0.75, lax: -0.3, laz: 0.75, nx: 0.2 }, "out"),
    K(0.42, { sx: -0.2, rlx: -1.1, rkx: 1.2, lkx: 0.25, llx: 0.12 }), K(0.62, {})] },
  spin: { dur: 0.95, hit: 0.5, trail: [0.18, 0.66], adv: [0.15, 0.6, 0.6, 0], keys: [
    K(0, {}), K(0.16, { sy: -0.9, rax: -1.4, ray: -1.3, rex: -0.3, wx: 1.5, ry: -0.2, lax: -0.6, laz: 0.9, yaw: 0, ny: 0.4 }),
    K(0.62, { sy: 0.4, rax: -1.5, ray: 0.5, rex: 0, wx: 1.57, ry: -0.24, lax: -0.4, laz: 1.2, yaw: Math.PI * 2, rz: 0.3, ny: 0.0 }, "lin"),
    K(0.95, { yaw: Math.PI * 2 })] },
  uppercut: { dur: 0.8, hit: 0.34, trail: [0.2, 0.5], adv: [0.1, 0.34, 0.45, 0], keys: [
    K(0, {}), K(0.18, { sx: 0.45, ry: -0.36, rax: 0.35, ray: -0.4, raz: -0.3, rex: -0.3, wx: 1.4, llx: -0.85, lkx: 1.2, rlx: 0.35, rkx: 0.7, ny: 0.2 }),
    K(0.36, { sx: -0.3, ry: 0.12, rax: -2.7, ray: 0.2, raz: -0.1, rex: -0.2, wx: 1.5, rz: 0.35, llx: -0.2, lkx: 0.1, rlx: 0.35, rkx: 0.3, lax: -0.2, laz: 0.6, nx: -0.3 }, "out"),
    K(0.55, { sx: -0.2, ry: 0.06, rax: -2.6, rex: -0.3, wx: 1.4, rz: 0.3 }), K(0.8, {})] },
  leap: { dur: 1.25, hit: 0.86, trail: [0.6, 0.95], keys: [
    K(0, {}), K(0.2, { sx: 0.45, ry: -0.36, llx: -0.9, lkx: 1.3, rlx: 0.2, rkx: 1.0, rax: -0.2, rex: -0.8 }),
    K(0.55, { sx: -0.2, ry: 1.7, rax: -3.0, rex: -0.6, wx: 1.2, lax: -2.4, lex: -0.8, llx: -0.9, lkx: 1.5, rlx: -0.2, rkx: 1.2, nx: -0.2 }, "out"),
    K(0.86, { sx: 0.65, ry: -0.34, rax: -0.65, rex: -0.1, wx: 1.5, lax: -0.6, lex: -0.4, llx: -0.8, lkx: 1.05, rlx: 0.5, rkx: 0.45 }, "in"),
    K(1.05, { sx: 0.55, ry: -0.32, rax: -0.6, rex: -0.2, wx: 1.45, llx: -0.78, lkx: 1.0, rlx: 0.48, rkx: 0.45 }), K(1.25, {})] },
  cast: { dur: 0.75, hit: 0.36, keys: [
    K(0, {}), K(0.2, { sy: -0.5, rax: -2.4, rex: -0.4, wx: 1.0, lax: -0.4, lex: -1.6, ny: 0.5, ry: -0.08 }),
    K(0.36, { sy: 0.35, sx: 0.2, lax: -1.55, lay: 0.1, lex: -0.05, rax: -1.9, rex: -0.2, wx: 1.3, rz: 0.15, ny: -0.2, llx: -0.55, lkx: 0.55 }, "out"),
    K(0.52, { sy: 0.3, lax: -1.5, lex: -0.1, rax: -1.8, wx: 1.3 }), K(0.75, {})] },
  block: { dur: 0.42, keys: [K(0, {}), KA(0.08, BLOCK, "out"), KA(0.3, BLOCK), K(0.42, {})] },
  blockHit: { dur: 0.42, adv: [0, 0.18, -0.32, 0], keys: [KA(0, BLOCK), KA(0.06, { ...BLOCK, sx: -0.18, rz: -0.12, ry: -0.08, nx: -0.05 }, "out"), KA(0.24, BLOCK), K(0.42, {})] },
  parry: { dur: 0.5, adv: [0.0, 0.2, 0.15, 0], keys: [K(0, {}), K(0.1, { rax: -1.6, ray: 0.9, rex: -0.6, wx: 0.6, sy: 0.3, ry: -0.12 }, "out"),
    K(0.2, { rax: -2.0, ray: -0.6, rex: -0.5, wx: 0.9, sy: -0.5, ry: -0.12 }, "out"), K(0.5, {})] },
  hitL: { dur: 0.42, adv: [0, 0.22, -0.35, 0], keys: [K(0, {}), K(0.07, { sx: -0.38, sz: 0.16, nx: -0.45, ny: 0.5, lax: -0.3, laz: 0.65, lex: -0.8, rax: -0.25, raz: -0.55, rex: -0.6, ry: -0.08, rz: -0.1 }, "out"), K(0.42, {})] },
  hitH: { dur: 0.75, adv: [0, 0.4, -0.9, 0], keys: [K(0, {}), K(0.09, { sx: -0.65, sz: -0.2, nx: -0.55, ny: -0.3, lax: -1.4, laz: 0.95, lex: -0.4, rax: -0.9, raz: -0.95, rex: -0.4, ry: -0.08, llx: 0.3, rlx: -0.3, rkx: 0.2 }, "out"),
    K(0.35, { sx: -0.35, nx: -0.2, ry: -0.18, llx: 0.35, lkx: 0.6, rlx: -0.4, rkx: 0.7, lax: -0.7, laz: 0.5, rax: -0.5, raz: -0.5 }), K(0.75, {})] },
  dodgeSide: { dur: 0.48, adv: [0.02, 0.3, -0.1, 1.15], keys: [K(0, {}), K(0.12, { ry: -0.32, sz: -0.45, hz: -0.18, sx: 0.2, llz: -0.35, rlz: -0.1, lkx: 0.7, rkx: 0.8, ny: 0.4 }, "out"),
    K(0.3, { ry: -0.22, sz: -0.25, hz: -0.1, lkx: 0.6, rkx: 0.6 }), K(0.48, {})] },
  dodgeBack: { dur: 0.45, adv: [0.02, 0.3, -1.05, 0], keys: [K(0, {}), K(0.1, { ry: 0.14, sx: -0.25, llx: -0.1, lkx: 0.8, rlx: 0.2, rkx: 0.9, nx: 0.1 }, "out"), K(0.28, { ry: -0.18, sx: 0.25, lkx: 0.7, rkx: 0.6 }), K(0.45, {})] },
  roll: { dur: 0.7, adv: [0.05, 0.6, 0, 1.9], keys: [KA(0, DOWN), KA(0.3, { ...KNEEL, hz: -0.4, sz: -0.5 }, "out"), K(0.7, {})] },
  getUp: { dur: 0.9, keys: [KA(0, DOWN), KA(0.35, KNEEL), K(0.9, {})] },
  taunt: { dur: 1.2, keys: [K(0, {}), K(0.3, { rax: -2.8, rex: -0.2, wx: 1.5, sy: 0, ny: 0, nx: -0.3, lax: -0.5, laz: 0.7, lex: -0.5, sx: -0.1 }, "out"), K(0.8, { rax: -2.85, rex: -0.1, wx: 1.55, nx: -0.32, sx: -0.12, lax: -0.5, laz: 0.75 }), K(1.2, {})] },
  // the arc and the landing are physics, the clip only holds the flail pose
  air: { dur: 999, keys: [KA(0, AIR, "out"), KA(0.25, AIR)] },
};
const RUN_BASE = pose({ sx: 0.38, nx: -0.22, rax: -0.55, raz: -0.2, rex: -1.25, wx: 0.6, lex: -1.3, laz: 0.12 });
const P_G = pose(G), P_RELAX = pose(RELAX), P_DOWN = pose(DOWN), P_VIC = pose(VICTORY), P_KNEEL = pose(KNEEL);

function sample(clip, t, out) {
  const ks = clip.keys;
  if (t <= ks[0][0]) { out.set(ks[0][1]); return; }
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, a] = ks[i - 1], [t1, b, e] = ks[i];
      const u = EASE[e || "io"](clamp((t - t0) / (t1 - t0), 0, 1));
      for (let j = 0; j < NC; j++) out[j] = a[j] + (b[j] - a[j]) * u;
      return;
    }
  }
  out.set(ks[ks.length - 1][1]);
}

// ---------- geometry ----------
let GEO = null;
function pumpkinGeo(r, ws = 22, hs = 14) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), lobe = 1 - 0.075 * (0.5 - 0.5 * Math.cos(a * 8));
    const yy = v.y / r;
    v.x *= lobe * 1.12; v.z *= lobe * 1.12; v.y *= 0.84;
    if (Math.abs(yy) > 0.8) v.y -= Math.sign(yy) * (Math.abs(yy) - 0.8) * r * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
function limb(r, len) { const g = new THREE.CapsuleGeometry(r, len, 4, 8); g.translate(0, -len / 2, 0); return g; }
function geos() {
  if (GEO) return GEO;
  const cyl = (a, b, h, s = 8) => new THREE.CylinderGeometry(a, b, h, s);
  const zAxis = (g) => { g.rotateX(Math.PI / 2); return g; };
  GEO = {
    head: pumpkinGeo(0.27), headLo: pumpkinGeo(0.2, 12, 8),
    stem: (() => { const g = cyl(0.025, 0.04, 0.12, 5); g.translate(0, 0.27, 0); g.rotateZ(0.2); return g; })(),
    torso: (() => { const g = cyl(0.25, 0.33, 0.66, 8); g.translate(0, 0.33, 0); return g; })(),
    skirt: (() => { const g = cyl(0.33, 0.46, 0.5, 8, 1); g.translate(0, -0.18, 0); return g; })(),
    pelvis: (() => { const g = cyl(0.27, 0.3, 0.2, 8); return g; })(),
    scarf: (() => { const g = new THREE.TorusGeometry(0.2, 0.065, 6, 14); g.rotateX(Math.PI / 2); return g; })(),
    tail: (() => { const g = new THREE.BoxGeometry(0.12, 0.42, 0.04); g.translate(0, -0.2, 0); return g; })(),
    uArm: limb(0.075, 0.24), lArm: limb(0.068, 0.22), hand: new THREE.SphereGeometry(0.085, 8, 6),
    uLeg: limb(0.095, 0.32), lLeg: limb(0.085, 0.32),
    boot: (() => { const g = new THREE.BoxGeometry(0.16, 0.12, 0.3); g.translate(0, -0.06, 0.06); return g; })(),
    hat: (() => { const g = new THREE.ConeGeometry(0.24, 0.55, 9); g.translate(0, 0.42, 0); return g; })(),
    brim: (() => { const g = cyl(0.42, 0.42, 0.025, 16); g.translate(0, 0.16, 0); return g; })(),
    band: (() => { const g = cyl(0.245, 0.245, 0.06, 12, 1); g.translate(0, 0.2, 0); return g; })(),
    // weapons: grip at the origin, blade along +Z
    swGrip: zAxis(cyl(0.028, 0.028, 0.24, 6)), swGuard: (() => { const g = new THREE.BoxGeometry(0.22, 0.04, 0.05); g.translate(0, 0, 0.13); return g; })(),
    swBlade: (() => { const g = new THREE.BoxGeometry(0.075, 0.016, 0.88); g.translate(0, 0, 0.59); return g; })(),
    shaft: (len) => { const g = zAxis(cyl(0.03, 0.03, len, 6)); g.translate(0, 0, len / 2 - 0.25); return g; },
    axeHead: (() => { const s = new THREE.Shape(); s.moveTo(0, -0.1); s.lineTo(0.3, -0.24); s.quadraticCurveTo(0.38, 0, 0.3, 0.24); s.lineTo(0, 0.1); s.lineTo(0, -0.1);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, -0.015); g.rotateY(-Math.PI / 2); g.rotateZ(Math.PI / 2); g.translate(0, 0, 0.62); return g; })(),
    scythe: (() => { const g = new THREE.TorusGeometry(0.46, 0.035, 4, 18, 1.9); g.scale(1, 1, 0.35); g.rotateY(Math.PI / 2); g.rotateX(Math.PI); g.translate(0, -0.46 + 0.02, 1.08); return g; })(),
    orb: new THREE.SphereGeometry(0.1, 12, 8),
    crown: (() => { const g = new THREE.CylinderGeometry(0.2, 0.2, 0.14, 10, 1, true); g.translate(0, 0.33, 0); return g; })(),
  };
  return GEO;
}

// ---------- face textures (glow of the carved face, mapped on the pumpkin's own UVs) ----------
const FACES = [];
export function faceTex(k) {
  if (FACES[k]) return FACES[k];
  const W = 256, H = 128, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
  const cx = W * 0.25, cy = H * 0.5;
  x.fillStyle = "#fff";
  const tri = (ax, ay, bx, by, qx, qy) => { x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.lineTo(qx, qy); x.closePath(); x.fill(); };
  const ex = 12, ey = cy - 10;
  if (k % 4 === 0) { tri(cx - ex - 8, ey + 6, cx - ex + 6, ey + 6, cx - ex - 2, ey - 8); tri(cx + ex - 6, ey + 6, cx + ex + 8, ey + 6, cx + ex + 2, ey - 8); }
  else if (k % 4 === 1) { tri(cx - ex - 9, ey - 4, cx - ex + 6, ey + 4, cx - ex - 6, ey + 7); tri(cx + ex + 9, ey - 4, cx + ex - 6, ey + 4, cx + ex + 6, ey + 7); }
  else if (k % 4 === 2) { x.beginPath(); x.ellipse(cx - ex, ey, 6, 7, 0, 0, 7); x.ellipse(cx + ex, ey, 6, 7, 0, 0, 7); x.fill(); }
  else { tri(cx - ex - 8, ey - 6, cx - ex + 7, ey - 6, cx - ex, ey + 7); tri(cx + ex - 7, ey - 6, cx + ex + 8, ey - 6, cx + ex, ey + 7); }
  x.beginPath();
  const my = cy + 13, mw = 22;
  if (k % 3 === 0) { x.moveTo(cx - mw, my - 4); for (let i = 0; i <= 6; i++) x.lineTo(cx - mw + (i * 2 * mw) / 6, my + (i % 2 ? 4 : -1)); x.lineTo(cx + mw, my - 4); x.quadraticCurveTo(cx, my + 16, cx - mw, my - 4); }
  else if (k % 3 === 1) { x.moveTo(cx - mw, my - 2); x.quadraticCurveTo(cx, my + 14, cx + mw, my - 2); x.lineTo(cx + mw - 6, my + 2); x.quadraticCurveTo(cx, my + 6, cx - mw + 6, my + 2); }
  else { x.moveTo(cx - mw + 2, my); x.lineTo(cx - 8, my + 7); x.lineTo(cx, my + 1); x.lineTo(cx + 8, my + 7); x.lineTo(cx + mw - 2, my); x.lineTo(cx, my + 12); }
  x.closePath(); x.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (FACES[k] = t);
}

const FACTION = { pumpkins: 0xc0662a, orders: 0x5f9a4a, both: 0x7c5cc4 };
const CLOTH = [0x1d1d24, 0x221f1c, 0x1b2125, 0x241c22];
export function factionOf(p) {
  const v = p.via || [];
  return v.includes("pumpkins") && v.includes("orders") ? "both" : v.includes("orders") ? "orders" : "pumpkins";
}
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class Fighter {
  constructor(scene, p, fx) {
    const g = geos(), h = h32(p.id);
    this.p = p; this.id = p.id; this.scene = scene; this.fx = fx;
    this.weapon = ["sword", "sword", "axe", "scythe", "scythe", "staff", "sword", "axe"][h % 8];
    const tier = clamp(Math.floor(Math.log2(Math.max(1, p.tickets || 1))), 0, 3);
    this.scale = 1 + tier * 0.06;
    const fc = FACTION[factionOf(p)];
    const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
    this.mats = {
      cloth: M({ color: CLOTH[(h >>> 3) % 4], flatShading: true }),
      dark: M({ color: 0x141418, roughness: 0.9 }),
      scarf: M({ color: fc, roughness: 0.9, emissive: fc, emissiveIntensity: 0.08, flatShading: true }),
      head: M({ color: 0xb4581e, roughness: 0.62, emissive: 0xffb050, emissiveIntensity: 2.4, emissiveMap: faceTex(h % 12) }),
      stem: M({ color: 0x3d3a22 }),
      metal: M({ color: 0x9aa0aa, roughness: 0.35, metalness: 0.8 }),
      wood: M({ color: 0x3b2a1c, roughness: 0.9 }),
      orb: new THREE.MeshBasicMaterial({ color: new THREE.Color(fc).multiplyScalar(2.2), toneMapped: false }),
      gold: M({ color: 0xd9a63a, roughness: 0.3, metalness: 0.9, emissive: 0x6a4a10, emissiveIntensity: 0.6 }),
    };
    const mk = (geo, mat, parent, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; parent.add(m); return m; };
    const grp = (parent, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.order = "YXZ"; parent.add(o); return o; };

    this.root = new THREE.Group(); this.root.scale.setScalar(this.scale); scene.add(this.root);
    const J = (this.j = {});
    J.hips = grp(this.root, 0, 0.95, 0);
    mk(g.pelvis, this.mats.cloth, J.hips); mk(g.skirt, this.mats.cloth, J.hips);
    J.spine = grp(J.hips, 0, 0.08, 0);
    mk(g.torso, this.mats.cloth, J.spine);
    J.head = grp(J.spine, 0, 0.92, 0);
    const head = mk(g.head, this.mats.head, J.head); head.position.y = 0.04;
    mk(g.stem, this.mats.stem, head, false);
    if ((h >>> 5) % 5 < 2) { mk(g.hat, this.mats.dark, head); mk(g.brim, this.mats.dark, head); mk(g.band, this.mats.scarf, head, false); }
    this.crown = mk(g.crown, this.mats.gold, head, false); this.crown.visible = false;
    const sc = mk(g.scarf, this.mats.scarf, J.spine); sc.position.y = 0.7;
    J.tail = grp(J.spine, 0.06, 0.68, -0.2); mk(g.tail, this.mats.scarf, J.tail);
    J.armL = grp(J.spine, 0.33, 0.6, 0); mk(g.uArm, this.mats.cloth, J.armL);
    J.elbowL = grp(J.armL, 0, -0.31, 0); mk(g.lArm, this.mats.cloth, J.elbowL);
    const hl = mk(g.hand, this.mats.dark, J.elbowL); hl.position.y = -0.3;
    J.armR = grp(J.spine, -0.33, 0.6, 0); mk(g.uArm, this.mats.cloth, J.armR);
    J.elbowR = grp(J.armR, 0, -0.31, 0); mk(g.lArm, this.mats.cloth, J.elbowR);
    J.wrist = grp(J.elbowR, 0, -0.3, 0); mk(g.hand, this.mats.dark, J.wrist);
    J.legL = grp(J.hips, 0.14, -0.04, 0); mk(g.uLeg, this.mats.dark, J.legL);
    J.kneeL = grp(J.legL, 0, -0.42, 0); mk(g.lLeg, this.mats.dark, J.kneeL);
    const bl = mk(g.boot, this.mats.dark, J.kneeL); bl.position.y = -0.36;
    J.legR = grp(J.hips, -0.14, -0.04, 0); mk(g.uLeg, this.mats.dark, J.legR);
    J.kneeR = grp(J.legR, 0, -0.42, 0); mk(g.lLeg, this.mats.dark, J.kneeR);
    const br = mk(g.boot, this.mats.dark, J.kneeR); br.position.y = -0.36;

    // weapon
    const W = (this.wpn = grp(J.wrist));
    this.tip = new THREE.Object3D(); this.base = new THREE.Object3D(); W.add(this.tip, this.base);
    if (this.weapon === "sword") { mk(g.swGrip, this.mats.dark, W); mk(g.swGuard, this.mats.metal, W); mk(g.swBlade, this.mats.metal, W); this.base.position.set(0, 0, 0.2); this.tip.position.set(0, 0, 1.02); }
    else if (this.weapon === "axe") { mk(g.shaft(0.95), this.mats.wood, W); mk(g.axeHead, this.mats.metal, W); this.base.position.set(0, 0, 0.45); this.tip.position.set(-0.36, 0, 0.62); }
    else if (this.weapon === "scythe") { mk(g.shaft(1.4), this.mats.wood, W); mk(g.scythe, this.mats.metal, W); this.base.position.set(0, 0, 1.0); this.tip.position.set(0, -0.62, 0.78); }
    else { mk(g.shaft(1.35), this.mats.wood, W); const o = mk(g.orb, this.mats.orb, W, false); o.position.z = 1.12; this.base.position.set(0, 0, 0.6); this.tip.position.set(0, 0, 1.12); }

    this.trail = new Trail(scene, this.weapon === "staff" ? new THREE.Color(fc).multiplyScalar(1.6) : new THREE.Color(1.5, 0.95, 0.6));
    this.cur = new Float32Array(NC); this.tgt = new Float32Array(NC); this.from = new Float32Array(NC);
    this.cur.set(P_RELAX);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.yawT = 0;
    this.mode = "idle"; this.clip = null; this.ct = 0; this.blendT = 1; this.blendDur = 0.1; this.advDone = 0;
    this.opp = null; this.space = 1.75; this.circle = 0;
    this.runTarget = null; this.runSpeed = 6; this.onArrive = null; this.phase = Math.random() * 6; this.moveAmt = 0; this.runAmt = 0;
    this.vel = new THREE.Vector3(); this.spinX = 0; this.lethal = false;
    this.hp = 1; this.alive = true; this.dying = 0; this.fade = 1; this.downT = 0; this.ground = (x, z) => 0;
    this.breath = Math.random() * 6; this.after = "guard";
  }

  place(x, z, yaw = 0) { this.pos.set(x, this.ground(x, z), z); this.yaw = this.yawT = yaw; this.sync(); }
  setGround(fn) { this.ground = fn; }
  /** Start a clip now. after: the mode to return to. */
  play(name, after, adv) {
    if (!this.alive || this.dying) return;
    let c = CLIPS[name]; if (!c) return;
    if (adv) c = { ...c, adv };
    this.from.set(this.cur); this.blendT = 0; this.blendDur = name === "air" ? 0.05 : 0.08;
    this.clip = c; this.clipName = name; this.ct = 0; this.advDone = 0;
    if (after) this.after = after;
    if (name !== "air") this.mode = "clip";
  }
  setMode(m) { if (this.mode === m) return; this.from.set(this.cur); this.blendT = 0; this.blendDur = m === "down" ? 0.05 : 0.18; this.mode = m; this.clip = null; }
  runTo(x, z, speed = 6.5, then) { this.runTarget = new THREE.Vector3(x, 0, z); this.runSpeed = speed; this.onArrive = then; this.setMode("run"); this.opp = null; }
  engage(o, space = 1.75) { this.opp = o; this.space = space; this.runTarget = null; this.after = "guard"; if (this.mode !== "clip" && this.mode !== "air" && this.mode !== "down") this.setMode("guard"); }
  faceTo(x, z) { this.yawT = Math.atan2(x - this.pos.x, z - this.pos.z); }
  /** Knocked into the air: dir (unit, xz), power. lethal = stays down and leaves. */
  launch(dx, dz, power, lethal) {
    this.vel.set(dx * power, 3.2 + power * 0.55, dz * power); this.spinX = 0; this.lethal = lethal;
    this.yawT = this.yaw = Math.atan2(-dx, -dz); // face the hit
    this.mode = "air"; this.from.set(this.cur); this.blendT = 0; this.blendDur = 0.06; this.clip = CLIPS.air; this.ct = 0; this.airY = this.pos.y;
  }
  knockDown(dx, dz, power) { this.launch(dx, dz, power, false); }
  die() {
    if (this.dying) return;
    this.dying = 0.001; this.hp = 0;
    for (const m of Object.values(this.mats)) { m.transparent = true; m.needsUpdate = true; }
  }
  victory() { this.setMode("victory"); this.crown.visible = true; }
  forward(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  chest(out) { return out.set(this.pos.x, this.pos.y + 1.25 * this.scale, this.pos.z); }

  update(dt, st) {
    if (!this.alive) return;
    const c = this.cur, t = this.tgt;
    this.breath += dt;
    let moving = 0;
    // ---- mode logic ----
    if (this.mode === "clip") {
      this.ct += dt;
      const cl = this.clip;
      sample(cl, this.ct, t);
      if (cl.adv) {
        const [a0, a1, f, s] = cl.adv, u = smooth(clamp((this.ct - a0) / (a1 - a0), 0, 1)), d = u - this.advDone;
        this.advDone = u;
        const fw = this.forward(v1);
        this.pos.x += (fw.x * f - fw.z * s) * d * this.scale; this.pos.z += (fw.z * f + fw.x * s) * d * this.scale;
      }
      if (this.ct >= cl.dur) { this.clip = null; this.from.set(this.cur); this.blendT = 0; this.blendDur = 0.14; this.mode = this.after || "guard"; }
    }
    if (this.mode === "air") {
      this.ct += dt; sample(CLIPS.air, this.ct, t);
      this.vel.y -= 16 * dt;
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
      this.spinX -= dt * 5.5;
      t[I.hx] = Math.max(-1.6, -0.6 + this.spinX * 0.3);
      const gy = this.ground(this.pos.x, this.pos.z);
      if (this.pos.y <= gy && this.vel.y < 0) {
        this.pos.y = gy; this.mode = "down"; this.downT = 0; this.from.set(t); this.blendT = 0; this.blendDur = 0.12;
        this.vel.y = 0; this.fx?.puff(this.pos.x, gy, this.pos.z, 16, 1.0, 3.2); this.onLand?.(this);
        if (this.lethal) this.die();
      }
    } else if (this.mode === "down") {
      this.downT += dt; t.set(P_DOWN);
      const fr = Math.exp(-dt * 4.5); this.vel.x *= fr; this.vel.z *= fr;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      if (this.downT < 0.5 && Math.hypot(this.vel.x, this.vel.z) > 1.5 && Math.random() < 0.5) this.fx?.puff(this.pos.x, this.pos.y, this.pos.z, 1, 0.6, 0.8);
    } else if (this.mode === "kneel") { t.set(P_KNEEL); t[I.sx] += Math.sin(this.breath * 3) * 0.04;
    } else if (this.mode === "victory") {
      t.set(P_VIC); t[I.ry] = Math.abs(Math.sin(this.breath * 2.2)) * 0.05; t[I.rax] += Math.sin(this.breath * 2.2) * 0.06;
    } else if (this.mode === "run") {
      const tg = this.runTarget;
      if (tg) {
        const dx = tg.x - this.pos.x, dz = tg.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.25) { this.runTarget = null; const cb = this.onArrive; this.onArrive = null; this.setMode(this.opp ? "guard" : "idle"); cb?.(this); }
        else { const s = Math.min(d, this.runSpeed * dt); this.pos.x += (dx / d) * s; this.pos.z += (dz / d) * s; this.yawT = Math.atan2(dx, dz); moving = this.runSpeed; }
      }
      this.runPose(t, moving, dt);
    } else if (this.mode === "guard") {
      t.set(P_G);
      const o = this.opp;
      if (o && o.alive) {
        const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
        this.yawT = Math.atan2(dx, dz);
        let step = 0;
        if (d > this.space + 0.12) step = Math.min(d - this.space, 2.6 * dt * (d > 4 ? 2.4 : 1));
        else if (d < this.space - 0.12) step = -Math.min(this.space - d, 1.8 * dt);
        this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
        if (this.circle) { const k = this.circle * dt; this.pos.x += (-dz / d) * k; this.pos.z += (dx / d) * k; }
        moving = Math.abs(step) / Math.max(dt, 1e-4) + Math.abs(this.circle);
      }
      const b = Math.sin(this.breath * 3.1);
      t[I.ry] += b * 0.02; t[I.sx] += b * 0.02; t[I.rax] += b * 0.03; t[I.lax] -= b * 0.03;
      if (moving > 0.2) { this.phase += dt * 9; const s = Math.sin(this.phase); t[I.llx] += s * 0.25; t[I.rlx] -= s * 0.25; t[I.lkx] += Math.max(0, s) * 0.3; t[I.rkx] += Math.max(0, -s) * 0.3; t[I.ry] += Math.abs(s) * 0.03; }
    } else if (this.mode === "idle") {
      t.set(P_RELAX);
      const b = Math.sin(this.breath * 1.8);
      t[I.sx] += b * 0.02; t[I.ny] = Math.sin(this.breath * 0.37) * 0.5; t[I.ry] = b * 0.012;
    }
    // ---- blend ----
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const u = smooth(this.blendT);
      for (let i = 0; i < NC; i++) c[i] = this.from[i] + (t[i] - this.from[i]) * u;
    } else c.set(t);
    // ---- facing ----
    let dy = this.yawT - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (this.mode !== "air" && this.mode !== "down") this.yaw += dy * Math.min(1, dt * (this.mode === "run" ? 10 : 7));
    if (this.mode !== "air") {
      const gy = this.ground(this.pos.x, this.pos.z);
      this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 20);
    }
    // ---- dying ----
    if (this.dying) {
      this.dying += dt;
      if (this.dying > 0.55 && !this.souled) { this.souled = true; this.fx?.soul(this.pos.x, this.pos.y + 0.3, this.pos.z); this.onSoul?.(this); }
      const f = clamp(1 - (this.dying - 0.7) / 1.1, 0, 1);
      if (f !== this.fade) {
        this.fade = f;
        for (const [k, m] of Object.entries(this.mats)) { m.opacity = f; if (k === "head") m.emissiveIntensity = 2.4 * f * f; }
      }
      if (f <= 0) { this.alive = false; this.root.visible = false; this.trail.mesh.visible = false; return; }
    }
    this.sync();
    // weapon trail
    const tr = this.clip?.trail, act = !!tr && this.ct >= tr[0] && this.ct <= tr[1];
    this.tip.getWorldPosition(v1); this.base.getWorldPosition(v2);
    this.trail.push(v2, v1, act && !this.dying, dt);
    if (this.mode === "run" && moving) { this.stepAcc = (this.stepAcc || 0) + dt; if (this.stepAcc > 0.09) { this.stepAcc = 0; if (Math.random() < 0.6) this.fx?.dust.spawn(this.pos.x, this.pos.y + 0.05, this.pos.z, (Math.random() - 0.5), 0.4, (Math.random() - 0.5), 0.6, 0.45, 0.3, 0.28, 0.27, 2, 0); } }
  }
  runPose(t, spd, dt) {
    const amt = clamp(spd / 6, 0, 1);
    this.phase += Math.max(0, spd) * dt * 1.9;
    const p = this.phase, s = Math.sin(p), co = Math.cos(p);
    t.set(spd > 0 ? RUN_BASE : P_RELAX);
    if (spd <= 0) return;
    t[I.llx] = -1.0 * s * amt; t[I.rlx] = 1.0 * s * amt;
    t[I.lkx] = 0.25 + 1.25 * Math.max(0, co) * amt; t[I.rkx] = 0.25 + 1.25 * Math.max(0, -co) * amt;
    t[I.lax] = 0.9 * s * amt - 0.2; t[I.lex] = -1.3;
    t[I.rax] = -0.55 - 0.35 * s * amt;
    t[I.ry] = -0.04 + Math.abs(co) * 0.09 * amt;
    t[I.sy] = s * 0.18 * amt; t[I.ny] = -s * 0.12 * amt;
  }
  sync() {
    const c = this.cur, J = this.j;
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw + c[I.yaw];
    J.hips.position.set(0, 0.95 + c[I.ry], c[I.rz]);
    J.hips.rotation.set(c[I.hx], c[I.hy], c[I.hz]);
    J.spine.rotation.set(c[I.sx], c[I.sy], c[I.sz]);
    J.head.rotation.set(c[I.nx], c[I.ny], c[I.nz]);
    J.armL.rotation.set(c[I.lax], c[I.lay], c[I.laz]); J.elbowL.rotation.x = c[I.lex];
    J.armR.rotation.set(c[I.rax], c[I.ray], c[I.raz]); J.elbowR.rotation.x = c[I.rex];
    J.wrist.rotation.set(c[I.wx], c[I.wy], c[I.wz]);
    J.legL.rotation.set(c[I.llx], c[I.lly], c[I.llz]); J.kneeL.rotation.x = c[I.lkx];
    J.legR.rotation.set(c[I.rlx], c[I.rly], c[I.rlz]); J.kneeR.rotation.x = c[I.rkx];
    J.tail.rotation.x = 0.35 + Math.sin(this.breath * 5) * 0.12 + (this.mode === "run" ? 0.6 : 0);
    this.root.updateMatrixWorld(true);
  }
  dispose() {
    this.scene.remove(this.root); this.trail.dispose(this.scene);
    for (const m of Object.values(this.mats)) m.dispose();
  }
}
