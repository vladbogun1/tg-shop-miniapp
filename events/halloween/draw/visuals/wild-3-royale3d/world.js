// Острів: рельєф, вода, небо, локації з простих форм, арена в центрі, стіна шторму.
import * as THREE from "./vendor/three.module.min.js";
import { glowTex } from "./fx.js";
import { tex, triplanar } from "./tex.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
function hash2(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;

export const ARENA_R = 13;
export const POIS = [
  { k: "manor", n: "Маєток", x: 0, z: -64, r: 15, h: 2.2 },
  { k: "yard", n: "Цвинтар", x: 54, z: -38, r: 14, h: 1.6 },
  { k: "shop", n: "Магазин ChiSetup", x: 54, z: 38, r: 12, h: 1.2 },
  { k: "swamp", n: "Болото", x: -4, z: 66, r: 14, h: 0.55 },
  { k: "hut", n: "Хатина відьми", x: -56, z: 34, r: 11, h: 1.4 },
  { k: "field", n: "Гарбузове поле", x: -56, z: -32, r: 15, h: 1.1 },
];
const FLATS = [{ x: 0, z: 0, r: ARENA_R + 4, h: 1.0 }, ...POIS];

export function coast(a) { return 104 + 8 * Math.sin(a * 3 + 1.3) + 5 * Math.sin(a * 7 + 0.4) + 3 * Math.sin(a * 13 + 2); }
function rawHeight(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x), c = coast(a);
  const land = (c - r) / 16;
  let h = land > 0 ? 0.35 + 1.5 * sstep(0, 1, land) : land * 4;
  if (land > 0) h += (fbm(x * 0.035 + 7, z * 0.035 - 3) - 0.45) * 5.5 * sstep(0, 1.2, land);
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z), w = sstep(f.r + 9, f.r, d);
    if (w > 0) h = h + (f.h - h) * w;
  }
  return h;
}
export function heightAt(x, z) { return rawHeight(x, z); }
export function isLand(x, z) { return rawHeight(x, z) > 0.4; }
/** Distance from (x,z) to the segment arena→POI, for paths. */
function pathDist(x, z) {
  let best = 1e9;
  for (const p of POIS) {
    const L = Math.hypot(p.x, p.z), ux = p.x / L, uz = p.z / L;
    const t = clamp(x * ux + z * uz, 0, L), dx = x - ux * t, dz = z - uz * t;
    const wob = Math.sin(t * 0.12 + p.x) * 2.2;
    best = Math.min(best, Math.abs(Math.hypot(dx, dz) - Math.abs(wob)));
  }
  return best;
}

function mergeGeos(list) {
  // positions + normals only, everything non-indexed
  let n = 0; const parts = list.map((g) => { const q = g.index ? g.toNonIndexed() : g; q.computeVertexNormals(); n += q.attributes.position.count; return q; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const q of parts) { pos.set(q.attributes.position.array, o * 3); nor.set(q.attributes.normal.array, o * 3); o += q.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return g;
}
function textTex(text, w, h, font, color, glow) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
  x.fillStyle = "#0b0b0d"; x.fillRect(0, 0, w, h);
  x.font = font; x.textAlign = "center"; x.textBaseline = "middle";
  if (glow) { x.shadowColor = glow; x.shadowBlur = h * 0.18; }
  x.fillStyle = color; x.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const STORM_VS = `
varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const STORM_FS = `
uniform float uTime; uniform float uOp; varying vec2 vUv; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  float a = atan(vW.z, vW.x);
  vec2 p = vec2(a * 18.0, vW.y * 0.22);
  float s = n(p + vec2(uTime * 0.6, -uTime * 0.9)) * 0.6 + n(p * 2.3 + vec2(-uTime, -uTime * 1.6)) * 0.4;
  float streak = smoothstep(0.55, 0.95, n(vec2(a * 60.0, vW.y * 0.05 - uTime * 1.5)));
  float bottom = 1.0 - smoothstep(0.0, 0.85, vUv.y);
  float alpha = ((0.07 + 0.3 * s) * (0.3 + 0.7 * bottom) + streak * 0.18 * bottom) * smoothstep(2.0, 16.0, length(cameraPosition - vW));
  vec3 col = mix(vec3(0.20, 0.07, 0.32), vec3(0.62, 0.30, 0.95), s * s) + vec3(0.9, 0.5, 1.2) * streak * 0.5;
  col += vec3(0.8, 0.35, 1.1) * smoothstep(0.08, 0.0, vUv.y) * 1.2;
  gl_FragColor = vec4(col, alpha * uOp);
}`;

export function buildWorld(scene) {
  const R = rng(1031);
  const root = new THREE.Group(); scene.add(root);
  const anim = []; // per-frame callbacks (flames etc.)
  const glow = glowTex();

  // ---------- sky ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uMoon: { value: new THREE.Vector3(-0.45, 0.42, -0.79).normalize() } },
    vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 uMoon; varying vec3 vD;
      void main(){ float y = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(vec3(0.075,0.06,0.10), vec3(0.018,0.02,0.035), smoothstep(0.0, 0.55, y));
        c += vec3(0.10,0.06,0.02) * smoothstep(0.25, 0.0, abs(y - 0.02)) * 0.6;
        float m = max(0.0, dot(vD, uMoon)); c += vec3(0.12,0.13,0.18) * pow(m, 24.0) + vec3(0.05,0.05,0.08) * pow(m, 4.0);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.renderOrder = -10; root.add(sky);
  const moonDir = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xdcd8cc, fog: false, depthWrite: false, toneMapped: false, transparent: true }));
  moon.position.copy(moonDir).multiplyScalar(800); moon.scale.setScalar(120); root.add(moon);
  const moonCore = new THREE.Mesh(new THREE.CircleGeometry(15, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.55, 1.4), fog: false, toneMapped: false }));
  moonCore.position.copy(moonDir).multiplyScalar(790); moonCore.lookAt(0, 0, 0); root.add(moonCore);
  {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, y = 0.08 + R() * 0.92, r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    root.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa0b8, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  }

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight(0x5a6890, 0x1a1210, 1.1); root.add(hemi);
  const moonL = new THREE.DirectionalLight(0xb9c6ff, 1.5);
  moonL.position.copy(moonDir).multiplyScalar(60); moonL.castShadow = true;
  moonL.shadow.mapSize.set(2048, 2048);
  const sc = moonL.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 160;
  moonL.shadow.bias = -0.0008; moonL.shadow.normalBias = 0.04;
  root.add(moonL, moonL.target);
  // a warm key light that follows the fight the camera looks at
  const key = new THREE.PointLight(0xff8a3a, 0, 22, 1.6); key.position.set(0, 6, 0); root.add(key);

  // ---------- ground ----------
  const S = 300, SEG = 170;
  const gg = new THREE.PlaneGeometry(S, S, SEG, SEG); gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position, col = new Float32Array(gp.count * 3), c = new THREE.Color();
  const C = { grass: new THREE.Color(0x1f2a20), grass2: new THREE.Color(0x2b3324), dirt: new THREE.Color(0x3b3026), sand: new THREE.Color(0x4a4334), rock: new THREE.Color(0x3a3a40),
    soil: new THREE.Color(0x33251a), yard: new THREE.Color(0x232428), swamp: new THREE.Color(0x18221c), stone: new THREE.Color(0x3e3c40), under: new THREE.Color(0x14181c) };
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), y = rawHeight(x, z);
    gp.setY(i, y);
    const n = fbm(x * 0.08, z * 0.08);
    c.copy(C.grass).lerp(C.grass2, n);
    if (y < 0.9) c.lerp(C.sand, sstep(0.9, 0.35, y));
    if (y < 0.2) c.copy(C.under);
    const pd = pathDist(x, z), r0 = Math.hypot(x, z);
    if (r0 > ARENA_R + 2 && y > 0.5) c.lerp(C.dirt, sstep(2.6, 1.0, pd) * 0.85);
    for (const p of POIS) {
      const d = Math.hypot(x - p.x, z - p.z), w = sstep(p.r + 2, p.r - 3, d);
      if (!w) continue;
      const tc = p.k === "field" ? (Math.sin((x - p.x) * 1.3) > 0.2 ? C.soil : C.grass2) : p.k === "yard" ? C.yard : p.k === "swamp" ? C.swamp : p.k === "manor" ? C.stone : C.dirt;
      c.lerp(tc, w * 0.85);
    }
    if (r0 < ARENA_R + 3.5) c.lerp(C.stone, sstep(ARENA_R + 3.5, ARENA_R + 1, r0));
    c.multiplyScalar(0.85 + n * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  gg.setAttribute("color", new THREE.BufferAttribute(col, 3)); gg.computeVertexNormals();
  // The storm tints the ground outside the zone and draws its edge line right in the ground shader.
  const stormU = { uStormR: { value: 999 }, uStormOp: { value: 0 } };
  const gmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  gmat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, stormU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWp; uniform float uStormR; uniform float uStormOp;")
      .replace("#include <opaque_fragment>", `#include <opaque_fragment>
        float dR = length(vWp.xz) - uStormR;
        float o = smoothstep(-0.5, 2.0, dR) * uStormOp;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.5, 0.32, 0.75) + vec3(0.045, 0.0, 0.08), o);
        gl_FragColor.rgb += vec3(1.1, 0.45, 1.6) * smoothstep(0.8, 0.0, abs(dR)) * uStormOp;`);
  };
  gmat.userData.storm = true; triplanar(gmat, tex("ground"), 0.2, 0.45);
  const ground = new THREE.Mesh(gg, gmat);
  ground.receiveShadow = true; root.add(ground);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1200, 64), new THREE.MeshStandardMaterial({ color: 0x080b12, roughness: 0.18, metalness: 0.7 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.0; root.add(water);
  // moonlight path on the water
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(40, 420), new THREE.MeshBasicMaterial({ map: glow, color: 0x2a3040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
  glint.rotation.x = -Math.PI / 2; glint.position.set(moonDir.x * 330, 0.05, moonDir.z * 330); glint.rotation.z = -Math.atan2(moonDir.x, -moonDir.z); root.add(glint);

  // ---------- materials ----------
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true, ...o });
  const mat = {
    stone: triplanar(M(0x5a5860), tex("brick"), 0.25), dstone: triplanar(M(0x3a3840), tex("brick"), 0.25), wood: triplanar(M(0x5a4030), tex("wood"), 0.45),
    roof: triplanar(M(0x3a2a30), tex("roof"), 0.4), grave: triplanar(M(0x60606a), tex("stone"), 0.3), iron: M(0x1d1d22, { roughness: 0.6, metalness: 0.5 }),
    pumpkin: M(0xc0601e, { roughness: 0.7, flatShading: false, map: tex("pumpkin") }), lit: M(0xc0601e, { roughness: 0.7, flatShading: false, map: tex("pumpkin"), emissive: 0xff8a30, emissiveIntensity: 0.7 }),
    // windows glow, but stay under the bloom threshold up close
    win: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.05, 0.66, 0.32), toneMapped: false }),
    green: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 1.2, 0.4), toneMapped: false }),
    swamp: new THREE.MeshStandardMaterial({ color: 0x0c1610, roughness: 0.55, metalness: 0.2, emissive: 0x0b2a12, emissiveIntensity: 0.6 }),
    tree: triplanar(M(0x3a2e26), tex("bark"), 0.3), leaf: M(0x2a2f22), sign: null,
  };
  const add = (geo, m, x, y, z, ry = 0, cast = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = cast; o.receiveShadow = true; root.add(o); return o; };
  const box = (w, h, d, m, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, ry);
  const flames = [];
  // solid things the camera and the people must stay out of: circle in plan + top height
  const blockers = [];
  const block = (x, z, r, top) => blockers.push({ x, z, r, top });
  function flame(x, y, z, s = 1, light = false) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(2.2, 1.0, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.position.set(x, y, z); sp.scale.setScalar(1.4 * s); root.add(sp);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.18 * s, 0.6 * s, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.4, 0.5), toneMapped: false }));
    core.position.set(x, y + 0.1 * s, z); root.add(core);
    let L = null;
    if (light) { L = new THREE.PointLight(0xff7a2a, 7, 16, 1.7); L.position.set(x, y + 0.6, z); root.add(L); }
    flames.push({ sp, core, L, s, ph: R() * 10, x, y, z });
  }
  function torch(x, z) { const y = rawHeight(x, z); add(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 5), mat.wood, x, y + 1.1, z); flame(x, y + 2.35, z, 0.6); }
  function pumpkin(x, z, s = 1, lit = false) { const y = rawHeight(x, z); const g = pumpkinGeo(0.45 * s); const o = add(g, lit ? mat.lit : mat.pumpkin, x, y + 0.32 * s, z, R() * 6); return o; }
  function pumpkinGeo(r) {
    const g = new THREE.SphereGeometry(r, 14, 9), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x), l = 1 - 0.08 * (0.5 - 0.5 * Math.cos(a * 8)); p.setXYZ(i, v.x * l * 1.15, v.y * 0.8, v.z * l * 1.15); }
    g.computeVertexNormals(); return g;
  }
  const deadTreeGeo = (() => {
    const parts = [];
    const tr = new THREE.CylinderGeometry(0.14, 0.32, 4.2, 6); tr.translate(0, 2.1, 0); parts.push(tr);
    for (const [a, h, l, tilt] of [[0.3, 2.8, 1.8, 0.9], [2.4, 3.3, 1.5, 0.8], [4.2, 2.3, 1.6, 1.0], [1.4, 3.8, 1.1, 0.6]]) {
      const b = new THREE.CylinderGeometry(0.04, 0.09, l, 5); b.translate(0, l / 2, 0); b.rotateZ(tilt); b.rotateY(a); b.translate(0, h, 0); parts.push(b);
    }
    return mergeGeos(parts);
  })();

  // ---------- arena ----------
  const AY = rawHeight(0, 0);
  add(new THREE.CylinderGeometry(ARENA_R, ARENA_R + 0.6, 0.5, 64), mat.stone, 0, AY + 0.0, 0, 0, false).receiveShadow = true;
  add(new THREE.CylinderGeometry(ARENA_R + 2.4, ARENA_R + 3.0, 0.3, 64), mat.dstone, 0, AY - 0.12, 0, 0, false);
  { // engraved rings on the floor
    const ring = (r, w, op) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 96), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = AY + 0.27; root.add(m); return m; };
    const r1 = ring(ARENA_R - 1.2, 0.12, 0.35), r2 = ring(4.2, 0.1, 0.25);
    anim.push((t) => { r1.material.opacity = 0.25 + 0.12 * Math.sin(t * 1.3); r2.material.opacity = 0.18 + 0.1 * Math.sin(t * 1.7 + 1); });
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13, x = Math.cos(a) * (ARENA_R + 1.6), z = Math.sin(a) * (ARENA_R + 1.6);
    const h = i % 3 === 1 ? 2.2 : 4.2;
    box(0.9, h, 0.9, mat.stone, x, AY, z, -a);
    if (i % 3 === 0) { add(new THREE.CylinderGeometry(0.55, 0.3, 0.45, 8), mat.iron, x, AY + h + 0.22, z); flame(x, AY + h + 0.6, z, 1.1, i % 6 === 0); }
  }

  // ---------- POIs ----------
  const P = Object.fromEntries(POIS.map((p) => [p.k, p]));
  { // manor
    const p = P.manor, y = p.h, x0 = p.x, z0 = p.z - 9;
    box(14, 7, 9, mat.dstone, x0, y, z0 - 2);
    const roof = add(new THREE.ConeGeometry(9.2, 4.2, 4), mat.roof, x0, y + 9.1, z0 - 2, Math.PI / 4); roof.scale.set(1.08, 1, 0.68);
    box(3.2, 12, 3.2, mat.stone, x0 + 6.4, y, z0 + 1.2);
    add(new THREE.ConeGeometry(2.6, 4, 4), mat.roof, x0 + 6.4, y + 14, z0 + 1.2, Math.PI / 4);
    for (const [wx, wy] of [[-4.5, 2.2], [-1.5, 2.2], [1.5, 2.2], [-4.5, 5], [-1.5, 5], [1.5, 5], [4.5, 5]]) add(new THREE.PlaneGeometry(1.1, 1.5), mat.win, x0 + wx, y + wy, z0 + 2.52, 0, false);
    add(new THREE.PlaneGeometry(0.9, 1.4), mat.win, x0 + 6.4, y + 9.5, z0 + 2.82, 0, false);
    box(2, 3, 0.4, mat.wood, x0 + 4.5, y, z0 + 2.6);
    for (let i = -6; i <= 6; i += 1.2) if (Math.abs(i) > 1.5) box(0.08, 1.6, 0.08, mat.iron, x0 + i, y, z0 + 4.6);
    box(4.6, 0.08, 0.08, mat.iron, x0 - 3.9, y + 1.3, z0 + 4.6); box(4.6, 0.08, 0.08, mat.iron, x0 + 3.9, y + 1.3, z0 + 4.6);
    torch(x0 - 2.2, z0 + 5.2); torch(x0 + 2.2, z0 + 5.2);
    // the moon is behind the house: a warm porch light keeps the facade readable
    const porch = new THREE.PointLight(0xffa060, 14, 22, 1.6); porch.position.set(x0, y + 4, z0 + 9); root.add(porch);
    block(x0 - 1.5, z0 - 2, 8.6, y + 11.5); block(x0 + 6.4, z0 + 1.2, 2.6, y + 16.2);
  }
  { // graveyard
    const p = P.yard;
    for (let i = 0; i < 30; i++) {
      const gx = p.x - 9 + (i % 6) * 3.4 + (R() - 0.5), gz = p.z - 7 + Math.floor(i / 6) * 3.4 + (R() - 0.5);
      if (Math.hypot(gx - p.x, gz - p.z) < 3.4) continue;
      const y = rawHeight(gx, gz), w = 0.8 + R() * 0.4, h = 0.9 + R() * 0.7;
      const s = add(new THREE.BoxGeometry(w, h, 0.22), mat.grave, gx, y + h / 2 - 0.1, gz, (R() - 0.5) * 0.3);
      s.rotation.z = (R() - 0.5) * 0.25;
      if (R() < 0.3) { const cr = add(new THREE.BoxGeometry(0.16, 1.4, 0.16), mat.grave, gx, y + 0.7, gz + 0.6); cr.rotation.z = (R() - 0.5) * 0.3; add(new THREE.BoxGeometry(0.7, 0.16, 0.16), mat.grave, gx, y + 1.0, gz + 0.6); }
    }
    box(4.5, 3.2, 5, mat.stone, p.x + 2, p.h, p.z - 11); block(p.x + 2, p.z - 11, 3.6, p.h + 5.2);
    const r = add(new THREE.ConeGeometry(3.6, 1.8, 4), mat.roof, p.x + 2, p.h + 4.1, p.z - 11, Math.PI / 4); r.scale.set(0.9, 1, 1.0);
    add(new THREE.PlaneGeometry(1.2, 1.9), mat.green, p.x + 2, p.h + 0.95, p.z - 8.47, 0, false);
    add(deadTreeGeo, mat.tree, p.x - 6, p.h - 0.2, p.z - 9, 0.4).scale.setScalar(1.5);
    flame(p.x + 5, p.h + 1.2, p.z + 4, 0.5); flame(p.x - 7, p.h + 1.1, p.z + 3, 0.5);
  }
  { // pumpkin field + scarecrow
    const p = P.field;
    for (let i = 0; i < 70; i++) {
      const row = i % 7, k = Math.floor(i / 7);
      const px = p.x - 11 + k * 2.4 + (R() - 0.5) * 0.8, pz = p.z - 9 + row * 3.0 + (R() - 0.5) * 0.6;
      if (Math.hypot(px - p.x, pz - p.z) < 3 || Math.hypot(px - p.x - 6, pz - p.z + 7) < 1.6 || R() < 0.15) continue;
      pumpkin(px, pz, 0.7 + R() * 0.7, R() < 0.18);
    }
    const y = p.h, sx = p.x + 6, sz = p.z - 7;
    add(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 5), mat.wood, sx, y + 1.8, sz);
    add(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 5), mat.wood, sx, y + 2.6, sz).rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.35, 0.55, 1.4, 6), triplanar(M(0x4a3c30), tex("cloth"), 0.8), sx, y + 2.3, sz);
    const sh = add(pumpkinGeo(0.42), mat.lit, sx, y + 3.4, sz); sh.castShadow = true;
    add(new THREE.ConeGeometry(0.4, 0.8, 8), mat.roof, sx, y + 4.0, sz);
    block(sx, sz, 0.9, y + 4.4);
  }
  { // witch hut
    const p = P.hut, y = p.h, hx = p.x - 6, hz = p.z - 5;
    const hb = box(5, 3.2, 4.4, mat.wood, hx, y, hz, 0.15); hb.rotation.z = 0.04;
    add(new THREE.ConeGeometry(4.2, 4.2, 5), mat.roof, hx, y + 5.2, hz, 0.3).rotation.z = 0.08;
    box(0.7, 2.2, 0.7, mat.stone, hx - 1.6, y + 3.8, hz - 1);
    add(new THREE.PlaneGeometry(0.9, 0.9), mat.win, hx + 1.2, y + 1.9, hz + 2.25, 0.15, false);
    block(hx, hz, 4.2, y + 7.4); block(p.x + 2.8, p.z + 2.2, 1.2, y + 1.6);
    // cauldron
    add(new THREE.SphereGeometry(1.0, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), mat.iron, p.x + 2.8, y + 1.05, p.z + 2.2);
    const brew = add(new THREE.CircleGeometry(0.82, 18), mat.green, p.x + 2.8, y + 1.5, p.z + 2.2, 0, false); brew.rotation.x = -Math.PI / 2;
    const gl = new THREE.PointLight(0x6aff4a, 6, 12, 1.8); gl.position.set(p.x + 2.8, y + 2.4, p.z + 2.2); root.add(gl);
    anim.push((t) => { gl.intensity = 5 + Math.sin(t * 5) * 1.2 + Math.sin(t * 13) * 0.6; });
    flame(p.x + 2.8, y + 0.2, p.z + 2.2, 0.7);
  }
  { // swamp
    const p = P.swamp;
    const w = add(new THREE.CircleGeometry(9, 32), mat.swamp, p.x + 3, p.h + 0.06, p.z + 2, 0, false); w.rotation.x = -Math.PI / 2; w.receiveShadow = true;
    const reed = new THREE.CylinderGeometry(0.03, 0.05, 1.6, 4); reed.translate(0, 0.8, 0);
    const inst = new THREE.InstancedMesh(reed, mat.leaf, 140); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 140; i++) {
      const a = R() * 6.283, rr = 8.5 + R() * 3.5, x = p.x + 3 + Math.cos(a) * rr, z = p.z + 2 + Math.sin(a) * rr;
      e.set((R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, rawHeight(x, z), z), q, new THREE.Vector3(1, 0.6 + R() * 0.9, 1)); inst.setMatrixAt(i, m4);
    }
    root.add(inst);
    for (const [dx, dz, s] of [[-6, -5, 1.2], [9, 7, 1.0], [-8, 8, 0.9]]) add(deadTreeGeo, mat.tree, p.x + dx, p.h - 0.2, p.z + dz, R() * 6).scale.setScalar(s);
    for (let i = 0; i < 6; i++) flame(p.x + (R() - 0.5) * 12, p.h + 0.6 + R() * 1.4, p.z + (R() - 0.5) * 10, 0.25);
  }
  { // shop
    const p = P.shop, y = p.h, x0 = p.x + 4, z0 = p.z + 8;
    block(x0, z0, 5.8, y + 6.6);
    box(9, 4.6, 6.5, mat.dstone, x0, y, z0, -0.75);
    const g = new THREE.Group(); g.position.set(x0, y, z0); g.rotation.y = -0.75; root.add(g);
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.3), new THREE.MeshBasicMaterial({ map: textTex("ChiSetup", 1024, 208, "900 150px 'Exo 2', sans-serif", "#ff7a1a", "#ff6600"), toneMapped: false }));
    sgn.material.color.setScalar(1.6); sgn.position.set(0, 5.3, -3.0); sgn.rotation.y = Math.PI; g.add(sgn);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.6, 0.2), mat.iron); sb.position.set(0, 5.3, -3.15); g.add(sb);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.0), mat.win); win.position.set(-1.2, 1.9, -3.27); win.rotation.y = Math.PI; g.add(win);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(7, 0.12, 1.4), M(0x5a2a10)); aw.position.set(0, 3.4, -3.9); aw.rotation.x = -0.25; g.add(aw);
    // a giant mouse on the roof, because it is a mouse shop
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M(0x1a1a1f, { roughness: 0.4, flatShading: false })); mouse.scale.set(1.25, 0.65, 2.0); mouse.position.set(1.5, 5.0, 0.8); g.add(mouse);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.7, 0.2), toneMapped: false })); wheel.rotation.z = Math.PI / 2; wheel.position.set(1.5, 5.6, -0.3); g.add(wheel);
    for (let i = 0; i < 4; i++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat.wood); cr.position.set(3.5 + (i % 2) * 1.0, 0.45 + Math.floor(i / 2) * 0.9, -4.0 + (i % 2) * 0.3); cr.castShadow = true; g.add(cr); }
    torch(p.x - 5, p.z - 3);
  }

  // ---------- scattered decor ----------
  const trees = new THREE.InstancedMesh(deadTreeGeo, mat.tree, 110); trees.castShadow = true;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat.rock = triplanar(M(0x55555e), tex("stone"), 0.35), 80); rocks.castShadow = true; rocks.receiveShadow = true;
  const lp = new THREE.InstancedMesh(pumpkinGeo(0.4), mat.lit, 60);
  const okSpot = (x, z, pad) => {
    if (!isLand(x, z) || rawHeight(x, z) < 0.8) return false;
    if (Math.hypot(x, z) < ARENA_R + 6) return false;
    for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return false;
    return pathDist(x, z) > 3;
  };
  {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    let ti = 0, ri = 0, li = 0;
    for (let k = 0; k < 4000 && (ti < 110 || ri < 80 || li < 60); k++) {
      const x = (R() - 0.5) * 220, z = (R() - 0.5) * 220;
      if (!okSpot(x, z, 1)) continue;
      const y = rawHeight(x, z), pick = R();
      if (pick < 0.45 && ti < 110) { e.set((R() - 0.5) * 0.15, R() * 6.28, (R() - 0.5) * 0.15); q.setFromEuler(e); s.setScalar(0.8 + R() * 0.9); m4.compose(v.set(x, y - 0.2, z), q, s); trees.setMatrixAt(ti++, m4); }
      else if (pick < 0.8 && ri < 80) { e.set(R() * 6, R() * 6, R() * 6); q.setFromEuler(e); const k2 = 0.4 + R() * 1.2; s.set(k2 * (1 + R()), k2 * 0.7, k2); m4.compose(v.set(x, y, z), q, s); rocks.setMatrixAt(ri++, m4); }
      else if (li < 60) { e.set(0, R() * 6.28, 0); q.setFromEuler(e); s.setScalar(0.7 + R() * 0.7); m4.compose(v.set(x, y + 0.25, z), q, s); lp.setMatrixAt(li++, m4); }
    }
    trees.count = ti; rocks.count = ri; lp.count = li;
    root.add(trees, rocks, lp);
  }
  for (const p of POIS) { // torches along each path
    const L = Math.hypot(p.x, p.z);
    for (const t of [0.42, 0.7]) { const x = (p.x / L) * L * t, z = (p.z / L) * L * t, nx = -p.z / L * 2.4, nz = p.x / L * 2.4; torch(x + nx, z + nz); }
  }

  // ---------- ground fog ----------
  const fogs = [];
  {
    for (let i = 0; i < 46; i++) {
      const a = R() * 6.283, r = 10 + R() * 85, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x6a6f86, transparent: true, opacity: 0.07, depthWrite: false })); s.userData.op = 0.07; s.scale.set(26 + R() * 18, 7 + R() * 4, 1); s.position.set(x, rawHeight(x, z) + 1.4, z); root.add(s);
      fogs.push({ s, x, z, ph: R() * 6 });
    }
    for (let i = 0; i < 10; i++) { const p = P.swamp, x = p.x + (R() - 0.5) * 16, z = p.z + (R() - 0.5) * 14; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x4aa060, transparent: true, opacity: 0.09, depthWrite: false })); s.userData.op = 0.09; s.scale.set(14, 4, 1); s.position.set(x, p.h + 1, z); root.add(s); fogs.push({ s, x, z, ph: R() * 6 }); }
  }

  // ---------- storm ----------
  const stormMat = new THREE.ShaderMaterial({ vertexShader: STORM_VS, fragmentShader: STORM_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uOp: { value: 1 } } });
  const storm = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 70, 128, 1, true), stormMat);
  storm.position.y = 34; storm.renderOrder = 3; root.add(storm);
  let stormR = 160;
  function setStorm(r, op = 1) {
    stormR = r;
    storm.scale.set(r, 1, r); stormU.uStormR.value = r; stormU.uStormOp.value = op;
    stormMat.uniforms.uOp.value = op; storm.visible = op > 0.01;
  }
  setStorm(160, 0);
  function update(t, dt, focus, camera) {
    for (const f of flames) {
      const k = 0.85 + 0.15 * Math.sin(t * 11 + f.ph) + 0.08 * Math.sin(t * 23 + f.ph * 2);
      f.sp.scale.setScalar(1.4 * f.s * k); f.core.scale.set(1, k, 1);
      if (f.L) f.L.intensity = 7 * k;
      if (camera) { const d = camera.position.distanceTo(f.sp.position); f.sp.material.opacity = clamp((d - 2) / 10, 0.12, 1); }
    }
    for (const a of anim) a(t, dt);
    for (const f of fogs) {
      f.s.position.x = f.x + Math.sin(t * 0.07 + f.ph) * 4; f.s.position.z = f.z + Math.cos(t * 0.05 + f.ph) * 3;
      // a fog bank right in front of the lens turns the frame into milk
      if (camera) f.s.material.opacity = f.s.userData.op * clamp((camera.position.distanceTo(f.s.position) - 6) / 18, 0, 1);
    }
    stormMat.uniforms.uTime.value = t;
    // from high up the island would sink into the night: lift the moon and sky fill with altitude
    if (camera) {
      const up = clamp((camera.position.y - 14) / 36, 0, 1);
      hemi.intensity = 1.1 + 3.2 * up; moonL.intensity = 1.5 + 2.4 * up;
    }
    if (focus) {
      moonL.position.set(focus.x + moonDir.x * 60, focus.y + moonDir.y * 60, focus.z + moonDir.z * 60);
      moonL.target.position.copy(focus); moonL.target.updateMatrixWorld();
      key.position.set(focus.x + 2, focus.y + 5, focus.z + 3);
    }
  }
  /** true when (x,z) is clear of buildings, with a margin */
  function free(x, z, pad = 1) { for (const b of blockers) if (Math.hypot(x - b.x, z - b.z) < b.r + pad) return false; return true; }
  /** push a camera position out of buildings and raise it until the view to `look` is clear */
  const tv = new THREE.Vector3();
  function clearView(pos, look) {
    for (const b of blockers) {
      const d = Math.hypot(pos.x - b.x, pos.z - b.z);
      if (d < b.r + 1.5 && pos.y < b.top + 1.5) pos.y = b.top + 1.5;
    }
    for (let it = 0; it < 12; it++) {
      let hit = null;
      for (let k = 1; k < 16 && !hit; k++) {
        tv.copy(pos).lerp(look, k / 16);
        for (const b of blockers) if (tv.y < b.top && Math.hypot(tv.x - b.x, tv.z - b.z) < b.r) { hit = b; break; }
      }
      if (!hit) break;
      pos.y += 1.2;
    }
    return pos;
  }
  /** is the segment a→b blocked by a building (for hiding name labels behind walls) */
  function occluded(a, b) {
    for (let k = 1; k < 12; k++) {
      tv.copy(a).lerp(b, k / 12);
      for (const q of blockers) if (tv.y < q.top - 0.5 && Math.hypot(tv.x - q.x, tv.z - q.z) < q.r - 0.4) return true;
    }
    return false;
  }
  return { root, update, setStorm, get stormR() { return stormR; }, key, moonL, hemi, heightAt, POIS, blockers, free, clearView, occluded };
}
