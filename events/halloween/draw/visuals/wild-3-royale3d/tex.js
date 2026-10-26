// Процедурні текстури (канвас, без файлів): трава, камінь, кладка, дошки, кора, черепиця, тканина, гарбуз.
// Усі безшовні; накладаються трипланарно за світовими координатами, тож не тягнуться на великих коробках.
import * as THREE from "./vendor/three.module.min.js";

const N = 256;
function hashP(x, y, p, s) { x = ((x % p) + p) % p; y = ((y % p) + p) % p; let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
/** periodic value noise, period p cells over the tile */
function pnoise(u, v, p, s) {
  const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hashP(xi, yi, p, s), b = hashP(xi + 1, yi, p, s), c = hashP(xi, yi + 1, p, s), d = hashP(xi + 1, yi + 1, p, s);
  const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const fbm = (u, v, p, s, o = 4) => { let t = 0, w = 0.5, n = 0; for (let i = 0; i < o; i++) { t += pnoise(u, v, p << i, s + i) * w; n += w; w *= 0.5; } return t / n; };
function rng(s) { return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** fill per pixel: f(u, v) → [r, g, b] in 0..1 */
function paint(f) {
  const cv = document.createElement("canvas"); cv.width = cv.height = N;
  const x = cv.getContext("2d"), img = x.createImageData(N, N), d = img.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const c = f(i / N, j / N), k = (j * N + i) * 4;
    d[k] = Math.min(255, c[0] * 255); d[k + 1] = Math.min(255, c[1] * 255); d[k + 2] = Math.min(255, c[2] * 255); d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { cv, x };
}
/** draw with wrap-around so strokes over an edge continue on the other side */
function wrap(x, fn) { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { x.save(); x.translate(dx, dy); fn(); x.restore(); } }
function done(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const gray = (g, tint = [1, 1, 1]) => [g * tint[0], g * tint[1], g * tint[2]];

const make = {
  // detail for the ground: tufts and pebbles; multiplied with the vertex colours of the terrain
  ground() {
    const { cv, x } = paint((u, v) => { const n = fbm(u, v, 4, 1), m = fbm(u, v, 16, 7, 3); return gray(0.66 + n * 0.3 + (m - 0.5) * 0.12); });
    const r = rng(11);
    wrap(x, () => {
      for (let i = 0; i < 900; i++) { // blades
        const px = r() * N, py = r() * N, l = 3 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 0.9, g = 150 + r() * 105;
        x.strokeStyle = `rgba(${g},${g},${g},0.3)`; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
      }
      for (let i = 0; i < 70; i++) { // pebbles
        const px = r() * N, py = r() * N, s = 1 + r() * 2.5, g = 120 + r() * 90;
        x.fillStyle = `rgba(${g},${g},${g},0.7)`; x.beginPath(); x.ellipse(px, py, s, s * 0.7, r() * 3, 0, 7); x.fill();
        x.fillStyle = "rgba(0,0,0,0.35)"; x.beginPath(); x.ellipse(px + 0.6, py + 0.8, s, s * 0.6, 0, 0, 7); x.fill();
      }
    });
    return done(cv);
  },
  // ashlar blocks for walls, pillars and the arena floor
  brick() {
    const rows = 8, cols = 4;
    const { cv } = paint((u, v) => {
      const row = Math.floor(v * rows), off = row % 2 ? 0.5 / cols : 0, cu = (u + off) * cols, col = Math.floor(cu);
      const fu = cu - col, fv = v * rows - row, edge = Math.min(fu, 1 - fu) / cols * 4, edgeV = Math.min(fv, 1 - fv);
      const mortar = Math.min(edge * 9, edgeV * 9);
      const tone = 0.62 + hashP(col, row, 1e6, 3) * 0.22, n = fbm(u, v, 8, 5) * 0.3 + fbm(u, v, 32, 9, 2) * 0.12;
      const g = mortar < 1 ? 0.32 + n * 0.3 : tone + n - 0.2 + (edgeV < 0.08 ? -0.08 : 0);
      return gray(g, [1, 0.98, 1.03]);
    });
    return done(cv);
  },
  // rough stone for graves and rocks
  stone() {
    const { cv, x } = paint((u, v) => { const n = fbm(u, v, 4, 21), m = fbm(u, v, 24, 23, 3); const vein = Math.abs(pnoise(u, v, 6, 25) - 0.5) < 0.02 ? -0.2 : 0; return gray(0.66 + n * 0.25 + (m - 0.5) * 0.1 + vein * 0.5, [1, 1, 1.04]); });
    const r = rng(31);
    wrap(x, () => { for (let i = 0; i < 26; i++) { x.strokeStyle = "rgba(20,20,26,0.3)"; x.lineWidth = 0.8; x.beginPath(); let px = r() * N, py = r() * N; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 18; py += (r() - 0.5) * 18; x.lineTo(px, py); } x.stroke(); } });
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(80,110,70,${0.15 + r() * 0.2})`; x.beginPath(); x.arc(r() * N, r() * N, 3 + r() * 9, 0, 7); x.fill(); } // moss
    return done(cv);
  },
  // vertical planks with grain
  wood() {
    const planks = 5;
    const { cv } = paint((u, v) => {
      const pu = u * planks, p = Math.floor(pu), fu = pu - p, seam = Math.min(fu, 1 - fu) < 0.04;
      const grain = Math.sin((u * 60 + fbm(u, v, 4, 40 + p) * 9) * 3.1) * 0.5 + 0.5;
      const knot = Math.max(0, 1 - Math.hypot((fu - hashP(p, 0, 99, 41)) * 3, (v - hashP(p, 1, 99, 42)) * 10)) * 0.4;
      const tone = 0.58 + hashP(p, 3, 99, 43) * 0.2;
      return gray(seam ? 0.22 : tone + grain * 0.18 - knot + (fbm(u, v, 16, 44, 2) - 0.5) * 0.15, [1.05, 0.95, 0.85]);
    });
    return done(cv);
  },
  bark() {
    const { cv } = paint((u, v) => { const s = Math.abs(Math.sin((u * 8 + fbm(u, v, 4, 51) * 2) * Math.PI)); const n = fbm(u, v, 8, 53); return gray(0.6 + s * 0.16 + n * 0.2, [1.04, 0.97, 0.9]); });
    return done(cv);
  },
  // overlapping shingle rows
  roof() {
    const rows = 10, cols = 8;
    const { cv } = paint((u, v) => {
      const row = Math.floor(v * rows), off = row % 2 ? 0.5 / cols : 0, cu = (u + off) * cols, col = Math.floor(cu), fu = cu - col, fv = v * rows - row;
      const round = fv + Math.pow(Math.abs(fu - 0.5) * 2, 3) * 0.25;
      const g = round > 0.92 ? 0.25 : 0.55 + hashP(col, row, 1e6, 61) * 0.25 + (fbm(u, v, 16, 62, 2) - 0.5) * 0.2 - fv * 0.18;
      return gray(g, [1, 0.94, 0.98]);
    });
    return done(cv);
  },
  // coarse weave for robes
  cloth() {
    const { cv } = paint((u, v) => { const w = (Math.sin(u * N * 1.2) * Math.sin(v * N * 1.2)) * 0.06; const n = fbm(u, v, 8, 71); const fold = Math.sin((u + fbm(u, v, 2, 73) * 0.4) * Math.PI * 8) * 0.06; return gray(0.78 + w + (n - 0.5) * 0.3 + fold); });
    return done(cv);
  },
  // ribs and speckles on pumpkins (u around, v up)
  pumpkin() {
    const { cv } = paint((u, v) => { const rib = Math.pow(Math.abs(Math.cos(u * Math.PI * 8)), 6); const n = fbm(u, v, 8, 81); const sp = hashP(Math.floor(u * 128), Math.floor(v * 128), 128, 83) > 0.985 ? 0.15 : 0; return [0.85 - rib * 0.35 + (n - 0.5) * 0.2 + sp, 0.8 - rib * 0.38 + (n - 0.5) * 0.25 + sp, 0.75 - rib * 0.3]; });
    return done(cv);
  },
};

const cache = new Map();
export function tex(name) { if (!cache.has(name)) cache.set(name, make[name]()); return cache.get(name); }
export function disposeTex() { for (const t of cache.values()) t.dispose(); cache.clear(); }

/**
 * Triplanar detail on a MeshStandardMaterial: colour × texture by world position, plus a small bump
 * from the same texture. scale = tiles per metre.
 */
export function triplanar(mat, t, scale = 0.25, bump = 0.25) {
  mat.userData.tri = { uTri: { value: t }, uTs: { value: scale }, uBump: { value: bump } };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, mat.userData.tri);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTw; varying vec3 vTn;")
      .replace("#include <project_vertex>", `#include <project_vertex>
        vec4 tw4 = vec4(transformed, 1.0); vec3 tn3 = objectNormal;
        #ifdef USE_INSTANCING
          tw4 = instanceMatrix * tw4; tn3 = mat3(instanceMatrix) * tn3;
        #endif
        vTw = (modelMatrix * tw4).xyz; vTn = normalize(mat3(modelMatrix) * tn3);`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTw; varying vec3 vTn; uniform sampler2D uTri; uniform float uTs; uniform float uBump; float triH;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 tb = pow(abs(normalize(vTn)), vec3(4.0)); tb /= (tb.x + tb.y + tb.z);
        vec3 tTex = texture2D(uTri, vTw.zy * uTs).rgb * tb.x + texture2D(uTri, vTw.xz * uTs).rgb * tb.y + texture2D(uTri, vTw.xy * uTs).rgb * tb.z;
        diffuseColor.rgb *= tTex * 1.35;
        triH = dot(tTex, vec3(0.3333));`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(triH) * r1 + dFdy(triH) * r2);
          normal = normalize(abs(det) * normal - uBump * clamp(1.0 - length(vViewPosition) / 35.0, 0.0, 1.0) * grad);
        }`);
  };
  mat.customProgramCacheKey = () => "tri" + (mat.userData.storm ? "s" : "");
  mat.needsUpdate = true;
  return mat;
}
