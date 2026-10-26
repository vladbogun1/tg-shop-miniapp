// Гарбузовий рояль 3D: острів на three.js, герої-гарбузи б'ються на камеру, решта — натовп.
// Режисер (director.js) заздалегідь розписує бій під переможця, тут — сцена, камера, HUD і цикл кадру.
import * as THREE from "./vendor/three.module.min.js";
import { EffectComposer } from "./vendor/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "./vendor/postprocessing/OutputPass.js";
import { ShaderPass } from "./vendor/postprocessing/ShaderPass.js";
import { buildWorld, heightAt, isLand, ARENA_R, POIS } from "./world.js";
import { FX } from "./fx.js";
import { Fighter } from "./fighter.js";
import { Crowd } from "./crowd.js";
import { makeRoll } from "./director.js";
import { sfx, stormLevel, stopAll } from "./audio.js";
import { disposeTex } from "./tex.js";

export const meta = { id: "wild-3-royale3d", title: "Гарбузовий рояль 3D", author: "agent" };

const W = 1920, H = 1080;
const CSS_URL = new URL("./style.css", import.meta.url).href;
const MAX_HEROES = 16;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (u) => u * u * (3 - 2 * u);
function h32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const initial = (n) => (String(n || "").trim()[0] || "?").toUpperCase();

const FINAL_SHADER = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.6 }, uBlur: { value: 0 }, uSat: { value: 1 }, uWarm: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uBlur, uSat, uWarm; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5; vec3 c;
      if (uBlur > 0.002) { c = vec3(0.0); for (int i = 0; i < 10; i++) { float k = 1.0 - uBlur * 0.1 * float(i) / 9.0; c += texture2D(tDiffuse, 0.5 + d * k).rgb; } c *= 0.1; }
      else c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, uSat);
      c *= mix(vec3(1.0), vec3(1.08, 0.98, 0.86), uWarm);
      float v = smoothstep(0.95, 0.3, length(d * vec2(1.25, 1.0))); c *= mix(1.0, v, uVig);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function mount(root, ctx) {
  const link = document.createElement("link");
  link.rel = "stylesheet"; link.href = CSS_URL;
  document.head.append(link);
  const RM = !!ctx.reducedMotion;

  root.classList.add("r3-root");
  root.innerHTML = `
    <div class="r3-stage">
      <canvas class="r3-c"></canvas>
      <div class="r3-lb top"></div><div class="r3-lb bot"></div>
      <div class="r3-labels"></div>
      <div class="r3-hud">
        <div class="r3-tl">
          <div class="r3-counter"><div class="r3-alive"><small class="r3-al">УЧАСНИКІВ</small><b class="r3-n">0</b></div><div class="r3-zone"><small class="r3-zk">РАУНД</small><span class="r3-zv">—</span></div></div>
          <div class="r3-prize"><small>РОЗІГРУЄМО</small><b class="r3-pn"></b><span class="r3-pi"></span></div>
          <div class="r3-loc"></div>
        </div>
        <div class="r3-feed"></div>
        <div class="r3-banner"></div>
        <div class="r3-ko">НОКАУТ!</div>
        <div class="r3-vs"><div class="r3-side l"><div class="r3-av"></div><div class="r3-meta"><b></b><div class="r3-hp"><i></i></div></div><div class="r3-combo"></div></div>
          <div class="r3-vsx">VS</div>
          <div class="r3-side r"><div class="r3-combo"></div><div class="r3-meta"><b></b><div class="r3-hp"><i></i></div></div><div class="r3-av"></div></div></div>
        <div class="r3-idle">Шукай себе на острові, чат!<small>Бій почнеться, коли ведучий запустить розіграш</small></div>
        <div class="r3-seed"></div>
        <div class="r3-flash"></div>
        <div class="r3-win"><div class="r3-kicker"></div><div class="r3-emb"></div><div class="r3-name"></div><div class="r3-sub"></div><div class="r3-pw">ВИГРАВ: <b></b></div></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const stageEl = $(".r3-stage"), canvas = $(".r3-c"), labelsEl = $(".r3-labels");
  const el = {
    n: $(".r3-n"), al: $(".r3-al"), zk: $(".r3-zk"), zv: $(".r3-zv"), prize: $(".r3-prize"), pn: $(".r3-pn"), pi: $(".r3-pi"), loc: $(".r3-loc"),
    feed: $(".r3-feed"), banner: $(".r3-banner"), ko: $(".r3-ko"), vs: $(".r3-vs"), idle: $(".r3-idle"), seed: $(".r3-seed"), flash: $(".r3-flash"),
    win: $(".r3-win"), kicker: $(".r3-kicker"), emb: $(".r3-emb"), name: $(".r3-name"), sub: $(".r3-sub"), pw: $(".r3-pw"), pwb: $(".r3-pw b"),
  };
  const vsSide = ["l", "r"].map((k) => { const s = root.querySelector(".r3-side." + k); return { el: s, av: s.querySelector(".r3-av"), name: s.querySelector("b"), hp: s.querySelector(".r3-hp i"), combo: s.querySelector(".r3-combo"), f: null, n: 0, last: 0, hpShown: 1 }; });

  // ---------- renderer ----------
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" }); }
  catch (e) { root.querySelector(".r3-idle").textContent = "WebGL недоступний"; console.error(e); return { setParticipants() {}, async roll() {}, reset() {}, destroy() { root.innerHTML = ""; link.remove(); } }; }
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const BG0 = new THREE.Color(0x0b0a10), BG1 = new THREE.Color(0x1d1a2a), FOG0 = new THREE.Color(0x100c16);
  scene.background = BG0.clone();
  scene.fog = new THREE.FogExp2(0x100c16, 0.0065);
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
  camera.position.set(0, 60, 120);
  const world = buildWorld(scene);
  const fx = new FX(scene);
  const crowd = new Crowd(scene, fx);
  const AY = heightAt(0, 0) + 0.25;
  const ground = (x, z) => (Math.hypot(x, z) < ARENA_R + 0.2 ? AY : heightAt(x, z));

  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.5, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finalPass = new ShaderPass(FINAL_SHADER);
  composer.addPass(finalPass);

  // ---------- layout & quality ----------
  let fit = 1, qual = 0; // qual: 0 best … 3 lowest
  const QS = [1, 0.85, 0.72, 0.6];
  function layout() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    fit = Math.min(w / W, h / H);
    stageEl.style.transform = `translate(${(w - W * fit) / 2}px, ${(h - H * fit) / 2}px) scale(${fit})`;
    const q = Math.min(1, fit * (devicePixelRatio || 1)) * QS[qual];
    const cw = Math.max(320, Math.round(W * q)), ch = Math.max(180, Math.round(H * q));
    renderer.setSize(cw, ch, false);
    composer.setSize(cw, ch);
    camera.userData.bufH = ch;
  }
  const onResize = () => layout();
  addEventListener("resize", onResize);
  layout();
  function degrade() {
    if (qual >= 3) return;
    qual++;
    if (qual >= 2) { renderer.shadowMap.enabled = false; world.moonL.castShadow = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
    if (qual >= 3) bloom.enabled = false;
    layout();
  }

  // ---------- state ----------
  let people = [], byId = new Map(), heroes = [], heroIds = [];
  let phase = "idle", st = 0, now = 0, plan = null, info = null, prize = null, winner = null, rollResolve = null;
  let rate = 1, hitstop = 0, shake = 0, wasSlow = false, lbOn = false;
  const tmpPool = Array.from({ length: 24 }, () => new THREE.Vector3()); let tmpI = 0;
  const tmp = () => tmpPool[(tmpI = (tmpI + 1) % tmpPool.length)];
  const pv = new THREE.Vector3();

  function homeOf(p, i) {
    const h = h32(p.id), poi = POIS[i % POIS.length];
    const a = ((h >>> 3) % 628) / 100, r = poi.r * (0.2 + ((h >>> 11) % 50) / 100);
    let x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r;
    if (!world.free(x, z, 1.2)) { x = poi.x + Math.cos(a) * 2.5; z = poi.z + Math.sin(a) * 2.5; }
    return { x, z, yaw: ((h >>> 7) % 628) / 100, poi };
  }
  function crowdSpot(p) {
    const h = h32(p.id), r = mulberry(h);
    for (let k = 0; k < 30; k++) {
      let x, z;
      if (r() < 0.62) { const poi = POIS[Math.floor(r() * POIS.length)], a = r() * 6.283, d = poi.r * 0.5 + r() * (poi.r + 8); x = poi.x + Math.cos(a) * d; z = poi.z + Math.sin(a) * d; }
      else { const a = r() * 6.283, d = ARENA_R + 6 + r() * 80; x = Math.cos(a) * d; z = Math.sin(a) * d; }
      if (Math.hypot(x, z) > ARENA_R + 4 && isLand(x, z) && heightAt(x, z) > 0.6 && world.free(x, z, 1)) return { x, z };
    }
    const poi = POIS[h % POIS.length]; return { x: poi.x + ((h >>> 4) % 9) - 4, z: poi.z + ((h >>> 8) % 9) - 4 };
  }

  function chooseHeroIds(list, must) {
    const sorted = list.slice().sort((a, b) => (b.tickets || 1) - (a.tickets || 1) || h32(a.id) - h32(b.id));
    const top = sorted.slice(0, 8);
    const rest = sorted.slice(8).sort((a, b) => h32(a.id + "h") - h32(b.id + "h"));
    const ids = [...top, ...rest].slice(0, MAX_HEROES).map((p) => p.id);
    if (must && !ids.includes(must)) { if (ids.length >= MAX_HEROES) ids.pop(); ids.push(must); }
    return ids;
  }
  function buildHeroes(ids) {
    for (const f of heroes) { f.label?.remove(); f.dispose(); }
    heroIds = ids;
    heroes = ids.map((id, i) => {
      const p = byId.get(id), f = new Fighter(scene, p, fx);
      f.setGround(ground); f.home = homeOf(p, i); f.place(f.home.x, f.home.z, f.home.yaw);
      f.setMode("idle"); f.onLand = onLand;
      const lb = document.createElement("div"); lb.className = "r3-lbl"; lb.innerHTML = `<b>${esc(nick(p))}</b><span class="r3-lhp"><i></i></span>`;
      if ((p.tickets || 1) > 1) lb.classList.add("t" + Math.min(3, Math.floor(Math.log2(p.tickets))));
      labelsEl.append(lb); f.label = lb; f.lhp = lb.querySelector("i"); f.idleT = 1 + Math.random() * 4;
      return f;
    });
    crowd.set(people.filter((p) => !ids.includes(p.id)), crowdSpot, ground);
  }
  function onLand(f) {
    if (f.dropping) {
      f.dropping = false; f.setMode("kneel"); f.kneelUntil = st + 0.75;
      fx.ring(f.pos.x, f.pos.y, f.pos.z, 4.5, 0xff8a30, 0.7); fx.puff(f.pos.x, f.pos.y, f.pos.z, 24, 1.1, 5); fx.sparks(f.pos.x, f.pos.y + 0.3, f.pos.z, 20, [2.4, 1.2, 0.4], 6);
      if (S.visible(f)) { sfx("land", 1, 0.8); shakeBy(0.15); }
    } else if (phase === "roll" && S.visible(f)) sfx("land", rate, 0.6);
  }

  function setParticipants(list) {
    people = (list || []).filter((p) => !p.won);
    byId = new Map(people.map((p) => [p.id, p]));
    if (phase === "roll" || phase === "win") return; // applied on the next reset (the winner is already marked `won` here)
    const ids = chooseHeroIds(people);
    if (ids.join() !== heroIds.join() || phase === "idle") buildHeroes(ids); else for (const f of heroes) f.p = byId.get(f.id) || f.p;
    if (phase === "idle") updateCount();
  }

  // ---------- prize ----------
  function setPrize(p) {
    prize = p && p.name ? p : null;
    el.prize.classList.toggle("on", !!prize);
    if (prize) { el.pn.textContent = prize.name; el.pi.textContent = (prize.items || []).slice(0, 4).join(" · "); el.pi.style.display = prize.items?.length ? "" : "none"; }
  }

  // ---------- HUD ----------
  let bannerT = 0, koT = 0, flashT = 0, feedLast = 0, hudAlive = -1;
  function banner(text, kind, dur) {
    el.banner.textContent = text; el.banner.className = "r3-banner on " + (kind || "");
    bannerT = now + (dur || 2);
    if (kind === "big" || kind === "red") ctx.sound?.("whoosh");
  }
  function feed(html, cls) {
    const d = document.createElement("div"); d.className = "r3-kf " + (cls || ""); d.innerHTML = html;
    el.feed.prepend(d);
    while (el.feed.children.length > 6) el.feed.lastChild.remove();
    d._t = now;
  }
  function flash(color) { if (RM) return; el.flash.style.background = color || "#fff"; el.flash.style.opacity = 0.3; flashT = now; }
  function shakeBy(a) { if (!RM) shake = Math.min(1.2, shake + a); }
  function avatarInto(box, p) {
    box.innerHTML = "";
    if (ctx.privacy?.avatars && p.avatar) { const im = new Image(); im.alt = ""; im.src = p.avatar; im.onerror = () => { box.textContent = initial(p.name); }; box.append(im); }
    else box.textContent = initial(p.name);
  }
  const hud = {
    hp() {},
    combo(att) {
      const s = vsSide.find((q) => q.f === att); if (!s) return;
      s.n = now - s.last < 1.6 ? s.n + 1 : 1; s.last = now;
      if (s.n >= 2) { const n = s.n, w = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "УДАРИ" : "УДАРІВ"; s.combo.innerHTML = `<b>${n}</b> ${w}`; s.combo.classList.remove("pop"); void s.combo.offsetWidth; s.combo.classList.add("pop"); }
    },
    vs(a, b) {
      if (!a) { el.vs.classList.remove("on"); vsSide[0].f = vsSide[1].f = null; return; }
      [a, b].forEach((f, i) => { const s = vsSide[i]; s.f = f; s.n = 0; s.combo.className = "r3-combo"; s.name.textContent = f.p.name; avatarInto(s.av, f.p); s.hpShown = f.hp; });
      el.vs.classList.add("on");
    },
    banner,
    letterbox(on) { lbOn = on; root.classList.toggle("lb", on); },
  };

  // ---------- scene services for the director ----------
  const S = {
    get heroes() { return heroes; }, world, fx, arenaY: AY, hud, tmp,
    rate: () => rate,
    shake: (a) => shakeBy(a),
    hitstop: (d) => { hitstop = Math.max(hitstop, d); },
    visible(f) {
      if (camera.position.distanceTo(f.pos) > 90) return false;
      pv.copy(f.pos); pv.y += 1; pv.project(camera);
      return pv.z < 1 && Math.abs(pv.x) < 1.2 && Math.abs(pv.y) < 1.2;
    },
    ko(att, vic, onCam) {
      if (att) feed(`<span class="k">${esc(att.p.name)}</span><span class="ic">⚔</span><span class="v">${esc(vic.p.name)}</span>`, "hero");
      else feed(`<span class="v">${esc(vic.p.name)}</span><span class="m">шторм</span>`, "zone");
      if (onCam) { el.ko.classList.remove("on"); void el.ko.offsetWidth; el.ko.classList.add("on"); koT = now; flash("#ffd9b0"); }
    },
    clearCrowd(x, z, r) {
      for (const d of crowd.list) {
        const dx = d.x - x, dz = d.z - z, l = Math.hypot(dx, dz);
        if (l < r) { const k = (r + 1.5) / Math.max(0.3, l); d.x = x + dx * k; d.z = z + dz * k; d.y = ground(d.x, d.z); }
      }
    },
    dropAll(t0, t1) {
      const hs = shuffleR(heroes.slice());
      hs.forEach((f, i) => {
        f.dropAt = t0 + (i / Math.max(1, hs.length)) * Math.min(1.8, t1 - t0); f.dropping = true;
        f.place(f.home.x, f.home.z, f.home.yaw); f.root.visible = false; f.trail.mesh.visible = false;
      });
      S.dropHero = hs[0];
      for (const d of crowd.list) d.drop = t0 + rollRnd() * (t1 - t0 + 0.6);
    },
    drum(on) { if (on) ctx.sound?.("drum"); },
    showWin,
  };
  let rollRnd = Math.random;
  const shuffleR = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rollRnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- camera ----------
  const cam = { pos: camera.position.clone(), look: new THREE.Vector3(0, 0, 0), fov: 45 };
  let shot = null, shotStart = 0, si = 0, fly = null, snapNext = true;
  const P = new THREE.Vector3(), L = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3(), n1 = new THREE.Vector3();
  function startShot(s) {
    shot = s; shotStart = now;
    if (s.cut) { snapNext = true; fly = null; }
    else if (s.fly) fly = { pos: cam.pos.clone(), look: cam.look.clone(), fov: cam.fov, t: 0, dur: s.flyDur || 1.0 };
    if (s.loc !== undefined) { el.loc.textContent = s.loc; el.loc.classList.toggle("on", !!s.loc); }
    s._n = null; s._a = null;
  }
  function pairCenter(a, b, out) {
    a.chest(c1); if (b) { b.chest(c2); out.copy(c1).lerp(c2, 0.5); } else out.copy(c1);
    out.y -= 0.35; return out;
  }
  function sideNormal(s, a, b) {
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
    n1.set(-dz / d, 0, dx / d);
    if (!s._n) { s._n = n1.clone().multiplyScalar(s.side || 1); } else { if (n1.dot(s._n) < 0) n1.negate(); s._n.lerp(n1, 0.08).normalize(); }
    return s._n;
  }
  /** Where the camera wants to be for the current shot; τ = real seconds since the shot started. */
  function desired(s, τ) {
    let fov = 42;
    const a = s.a, b = s.b;
    switch (s.kind) {
      case "drop": {
        const f = S.dropHero;
        if (!f) { P.set(0, 70, 110); L.set(0, 0, 0); break; }
        const hx = f.home.x, hz = f.home.z, l = Math.hypot(hx, hz) || 1;
        P.set(hx + (hx / l) * 9 + (-hz / l) * 3, ground(hx, hz) + 1.8, hz + (hz / l) * 9 + (hx / l) * 3);
        L.set(f.pos.x, Math.max(f.pos.y, ground(hx, hz)) + 0.8, f.pos.z);
        if (!f.root.visible) L.set(hx, ground(hx, hz) + 14, hz);
        fov = 58; break;
      }
      case "aerial": case "arena": {
        let cx = 0, cy = 0, cz = 0;
        if (s.kind === "arena") {
          const fs = (plan?.FIN || []).filter((f) => f.alive && !f.dying);
          if (fs.length) { for (const f of fs) { cx += f.pos.x; cz += f.pos.z; } cx /= fs.length; cz /= fs.length; }
          cy = AY + 1.0;
        }
        const ang = (s.a0 || 0) + (s.w || 0.1) * τ;
        P.set(cx + Math.cos(ang) * s.r, cy + s.h, cz + Math.sin(ang) * s.r);
        L.set(cx, cy, cz); fov = s.kind === "arena" ? 46 : 50; break;
      }
      case "duel": case "low": case "ots": {
        if (!a || !b) { P.copy(cam.pos); L.copy(cam.look); break; }
        pairCenter(a, b, L);
        const n = sideNormal(s, a, b), d = Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
        if (s.kind === "ots") {
          const dx = (b.pos.x - a.pos.x) / (d || 1), dz = (b.pos.z - a.pos.z) / (d || 1);
          P.set(a.pos.x - dx * 3.4 + n.x * 1.5, a.pos.y + 2.1 * a.scale, a.pos.z - dz * 3.4 + n.z * 1.5);
          b.chest(L); L.y -= 0.2; fov = 40;
        } else if (s.kind === "low") {
          const dist = Math.max(3.6, d * 1.15 + 2.2);
          P.set(L.x + n.x * dist, ground(L.x, L.z) + 0.45, L.z + n.z * dist); L.y += 0.35; fov = 54;
        } else {
          const dist = Math.max(4.2, d * 1.3 + 2.6), sw = Math.sin(τ * 0.35) * 0.22;
          const nx = n.x * Math.cos(sw) - n.z * Math.sin(sw), nz = n.x * Math.sin(sw) + n.z * Math.cos(sw);
          P.set(L.x + nx * dist, L.y + 1.7, L.z + nz * dist); fov = 42;
        }
        break;
      }
      case "orbit": {
        if (!a) { P.copy(cam.pos); L.copy(cam.look); break; }
        a.chest(c1); if (b && (b.alive || b.dying)) { b.chest(c2); L.copy(c1).lerp(c2, 0.4); } else L.copy(c1);
        L.y = Math.min(L.y, ground(L.x, L.z) + 1.6) - 0.15;
        if (s._a === null) { s._a = Math.atan2(cam.pos.z - L.z, cam.pos.x - L.x); s._c = L.clone(); }
        s._c.lerp(L, 0.05); L.copy(s._c);
        const ang = s._a + (s.w || 0.8) * τ;
        P.set(L.x + Math.cos(ang) * s.r, ground(L.x, L.z) + s.h, L.z + Math.sin(ang) * s.r);
        fov = 44; break;
      }
      case "gate": {
        if (s._a === null) s._a = Math.atan2(cam.pos.z, cam.pos.x);
        const u = smooth(clamp(τ / 3.8, 0, 1)), r = 46 - 26 * u;
        P.set(Math.cos(s._a) * r, AY + 24 - 20.5 * u, Math.sin(s._a) * r);
        L.set(0, AY + 1.2, 0); fov = 50; break;
      }
      case "hero": {
        if (!a) break;
        const u = smooth(clamp(τ / 3.2, 0, 1)), ang = a.yaw + 0.55 + 0.1 * τ;
        const r = 5.6 - 2.0 * u, h = 0.55 + 1.3 * u;
        P.set(a.pos.x + Math.sin(ang) * r, a.pos.y + h, a.pos.z + Math.cos(ang) * r);
        a.chest(L); L.y += 0.25 - 0.3 * (1 - u); fov = 40; break;
      }
      default: P.copy(cam.pos); L.copy(cam.look);
    }
    return fov;
  }
  const bz = new THREE.Vector3(), ap = new THREE.Vector3();
  function updateCamera(dt) {
    if (!shot) return 0;
    const fov = desired(shot, now - shotStart);
    world.clearView(P, L);
    let blur = 0;
    if (snapNext) { cam.pos.copy(P); cam.look.copy(L); cam.fov = fov; snapNext = false; }
    else if (fly && fly.t < fly.dur) {
      fly.t += dt; const u = smooth(clamp(fly.t / fly.dur, 0, 1));
      const dist = fly.pos.distanceTo(P);
      ap.copy(fly.pos).lerp(P, 0.5); ap.y = Math.max(fly.pos.y, P.y) + dist * 0.22 + 3;
      bz.copy(fly.pos).multiplyScalar((1 - u) * (1 - u)).addScaledVector(ap, 2 * u * (1 - u)).addScaledVector(P, u * u);
      cam.pos.copy(bz); cam.look.copy(fly.look).lerp(L, smooth(clamp(fly.t / (fly.dur * 0.8), 0, 1)));
      cam.fov = fly.fov + (fov - fly.fov) * u + Math.sin(u * Math.PI) * 9;
      blur = RM ? 0 : Math.sin(u * Math.PI) * Math.min(1, dist / 30) * 0.9;
    } else {
      const k = 1 - Math.exp(-dt * 5), kl = 1 - Math.exp(-dt * 8);
      cam.pos.lerp(P, k); cam.look.lerp(L, kl); cam.fov += (fov - cam.fov) * k;
    }
    camera.position.copy(cam.pos);
    if (shake > 0.001) {
      const s = shake * 0.22;
      camera.position.x += (Math.sin(now * 61) + Math.sin(now * 37)) * s; camera.position.y += Math.sin(now * 53) * s; camera.position.z += Math.cos(now * 47) * s;
      shake *= Math.exp(-dt * 7);
    }
    // never under the ground
    const gy = heightAt(camera.position.x, camera.position.z);
    if (camera.position.y < Math.max(gy, 0.3) + 0.3) camera.position.y = Math.max(gy, 0.3) + 0.3;
    camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    return blur;
  }

  // ---------- idle ----------
  let idleI = 0, idleNext = 0;
  function idleCam() {
    if (now < idleNext) return;
    idleI++;
    let s;
    if (idleI % 2 === 1) { s = { kind: "aerial", r: 78, h: 40, a0: Math.random() * 6.28, w: 0.045, fly: true, flyDur: 2.2, loc: "" }; idleNext = now + 13; }
    else {
      const f = heroes[Math.floor(Math.random() * heroes.length)];
      const poi = f ? f.home.poi : POIS[idleI % POIS.length];
      // look from the arena side: the buildings stand behind each place, so the view stays open
      s = { kind: "poi", poi, fly: true, flyDur: 2.4, a0: Math.atan2(-poi.z, -poi.x) + (Math.random() - 0.5) * 1.2, loc: poi.n }; idleNext = now + 9;
    }
    startShot(s);
  }
  // POI glide, used only while idle
  function desiredPoi(s, τ) {
    const p = s.poi, ang = s.a0 + 0.07 * τ, y = heightAt(p.x, p.z);
    P.set(p.x + Math.cos(ang) * (p.r + 8), y + 7.5, p.z + Math.sin(ang) * (p.r + 8)); L.set(p.x, y + 1.2, p.z);
    return 46;
  }
  function idleHeroes(dt) {
    for (const f of heroes) {
      if (!f.alive) continue;
      f.idleT -= dt;
      if (f.mode === "kneel" && st > (f.kneelUntil || 0)) f.setMode("idle");
      if (f.idleT > 0 || f.mode === "clip" || f.mode === "air") continue;
      const r = Math.random(), hm = f.home;
      if (r < 0.5) {
        const a = Math.random() * 6.283, d = Math.random() * hm.poi.r * 0.6, x = hm.poi.x + Math.cos(a) * d, z = hm.poi.z + Math.sin(a) * d;
        if (world.free(x, z, 1.2)) f.runTo(x, z, 2.2 + Math.random() * 1.5, (q) => q.setMode("idle"));
        f.idleT = 3 + Math.random() * 3;
      } else if (r < 0.75) { f.play("taunt", "idle"); f.idleT = 2.5 + Math.random() * 2; }
      else { f.setMode("idle"); f.idleT = 2 + Math.random() * 3; }
    }
  }
  const idleQ = [];
  // ---------- roll ----------
  function roll(w, inf) {
    return new Promise((resolve) => {
      info = inf || { round: 1, totalRounds: 5, totalTickets: 0, seedHash: "" };
      if ("prize" in info) setPrize(info.prize);
      if (!byId.has(w.id)) { people.push(w); byId.set(w.id, w); }
      winner = byId.get(w.id);
      buildHeroes(chooseHeroIds(people, winner.id));
      crowd.revive();
      idleQ.length = 0;
      fx.clear();
      rollRnd = mulberry(h32(String(info.seedHash || "") + ":" + info.round + ":" + w.id));
      const W0 = heroes.find((f) => f.id === winner.id);
      for (const f of heroes) { f.spar = null; f.opp = null; f.circle = 0; f.setMode("idle"); }
      st = 0; si = 0; rate = 1; hitstop = 0; wasSlow = false;
      plan = makeRoll(S, W0, info, rollRnd);
      scheduleCrowd();
      phase = "roll"; rollResolve = resolve;
      el.win.classList.remove("on"); root.classList.remove("idle");
      el.al.textContent = "ЖИВИХ"; el.zk.textContent = "РАУНД"; el.zv.textContent = `${info.round}/${info.totalRounds}`;
      el.seed.textContent = `Квитки: ${info.totalTickets || 0} · seed ${String(info.seedHash || "").slice(0, 8)}`;
      el.feed.innerHTML = ""; hud.vs(null); hud.letterbox(false);
      ctx.sound?.("drum"); sfx("drop", 1, 1);
    });
  }
  /** When each crowd member drops out: on a curve, but never later than the storm reaching them. */
  let crowdQ = [], crowdQi = 0;
  function scheduleCrowd() {
    const list = crowd.list, n = list.length;
    const k70 = plan.keys.find((k) => k[1] === 70)?.[0] ?? plan.T0 + 12;
    const curve = [[plan.T0 + 0.6, 1], [k70, 0.3], [plan.wavesEnd, 0.05], [plan.finalAt + 2.0, 0]];
    const timeFor = (alive) => {
      for (let i = 1; i < curve.length; i++) if (alive >= curve[i][1]) { const [t0, a0] = curve[i - 1], [t1, a1] = curve[i]; return t0 + ((a0 - alive) / Math.max(1e-6, a0 - a1)) * (t1 - t0); }
      return curve[curve.length - 1][0];
    };
    const samples = []; for (let t = 0; t <= plan.finalAt + 6; t += 0.1) samples.push([t, plan.stormR(t)]);
    const order = list.map((d) => ({ d, k: Math.hypot(d.x, d.z) / 110 + rollRnd() * 0.8 })).sort((a, b) => b.k - a.k);
    order.forEach(({ d }, i) => {
      const tc = timeFor(1 - (i + 1) / n) + (rollRnd() - 0.5) * 0.3;
      const dist = Math.hypot(d.x, d.z);
      let tp = Infinity; for (const [t, r] of samples) if (r < dist - 1) { tp = t; break; }
      d.dieAt = Math.min(tc, tp); d.dieKind = tp <= tc ? 1 : 0;
    });
    crowdQ = list.slice().sort((a, b) => a.dieAt - b.dieAt); crowdQi = 0;
  }
  let crowdFeedT = 0;
  function crowdDeaths() {
    let loud = 0;
    while (crowdQi < crowdQ.length && crowdQ[crowdQi].dieAt <= st) {
      const d = crowdQ[crowdQi++];
      if (!d.alive) continue;
      pv.set(d.x, d.y + 1, d.z);
      const near = camera.position.distanceTo(pv) < 70 && loud < 4;
      let quiet = !near;
      if (near) { pv.project(camera); quiet = pv.z > 1 || Math.abs(pv.x) > 1.1 || Math.abs(pv.y) > 1.1; }
      crowd.kill(d, d.dieKind, quiet);
      if (!quiet) { loud++; if (camera.position.distanceTo(c1.set(d.x, d.y, d.z)) < 35) sfx("poof", 1, 0.5); }
      if (now - crowdFeedT > 0.5) {
        crowdFeedT = now;
        if (d.dieKind === 1) feed(`<span class="v">${esc(d.p.name)}</span><span class="m">шторм</span>`, "zone");
        else {
          const k = crowd.list[Math.floor(rollRnd() * crowd.list.length)];
          if (k && k.alive && k !== d) feed(`<span class="k">${esc(k.p.name)}</span><span class="ic">⚔</span><span class="v">${esc(d.p.name)}</span>`, "");
          else feed(`<span class="v">${esc(d.p.name)}</span><span class="m">вибув</span>`, "zone");
        }
      }
    }
  }

  function showWin() {
    phase = "win";
    const w = winner;
    hud.vs(null);
    el.kicker.textContent = `ПЕРЕМОЖЕЦЬ · РАУНД ${info.round}/${info.totalRounds}`;
    el.name.textContent = w.name;
    el.name.style.fontSize = Math.min(124, Math.floor((W - 260) / (Math.max(6, String(w.name).length) * 0.6))) + "px";
    const chance = info.totalTickets ? (w.tickets / info.totalTickets) * 100 : 0;
    el.sub.innerHTML = `${w.handle ? esc(w.handle) + " · " : ""}Квитки: <b>${w.tickets}</b> · шанс ${chance < 10 ? chance.toFixed(1) : Math.round(chance)}%`;
    avatarInto(el.emb, w);
    el.pw.classList.toggle("on", !!prize); if (prize) el.pwb.textContent = prize.name;
    el.win.classList.add("on");
    hud.letterbox(false);
    ctx.sound?.("win"); ctx.sound?.("boom"); flash("#ffe6c4"); shakeBy(0.4);
    for (let i = 0; i < 80; i++) { const f = heroes.find((q) => q.id === w.id); if (!f) break; const a = Math.random() * 6.283; fx.add.spawn(f.pos.x, f.pos.y + 2.4, f.pos.z, Math.cos(a) * 3, 4 + Math.random() * 4, Math.sin(a) * 3, 1.6 + Math.random(), 0.12, ...[[2.4, 1.0, 0.2], [0.6, 2.2, 0.4], [1.3, 0.6, 2.4]][i % 3], 1.2, 5, 2); }
    setTimeout(() => { const r = rollResolve; rollResolve = null; r?.(); }, 700);
  }

  function reset() {
    phase = "idle"; plan = null; winner = null; rate = 1;
    const r = rollResolve; rollResolve = null; r?.();
    el.win.classList.remove("on"); hud.vs(null); hud.letterbox(false); el.banner.classList.remove("on"); el.loc.classList.remove("on");
    el.feed.innerHTML = ""; el.seed.textContent = ""; root.classList.add("idle");
    el.al.textContent = "УЧАСНИКІВ"; el.zk.textContent = "РАУНД"; el.zv.textContent = info ? `${Math.min(info.round + 1, info.totalRounds)}/${info.totalRounds}` : "—";
    fx.clear(); stormLevel(0); world.setStorm(160, 0);
    buildHeroes(chooseHeroIds(people));
    crowd.revive();
    idleNext = 0; idleI = 0;
    updateCount();
  }
  function updateCount() {
    let n;
    if (phase === "idle") n = people.length;
    else { n = crowd.aliveCount; for (const f of heroes) if (f.alive && f.hp > 0) n++; }
    if (n !== hudAlive) { hudAlive = n; el.n.textContent = n; }
  }

  // ---------- frame ----------
  let raf = 0, last = performance.now(), perfAcc = 0, perfN = 0, perfSlow = 0, alive = true;
  function frame(t) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    let dt = Math.min(0.05, (t - last) / 1000); last = t;
    now += dt;
    // auto quality: a few slow seconds in a row → step down
    perfAcc += dt; perfN++;
    if (perfAcc > 2) { if (perfAcc / perfN > 0.022) { if (++perfSlow >= 2) { degrade(); perfSlow = 0; } } else perfSlow = 0; perfAcc = 0; perfN = 0; }

    let sdt = dt;
    if (phase === "roll" || phase === "win") {
      if (plan) {
        rate = phase === "roll" ? plan.timeScale(st) : 1;
        if (hitstop > 0) { hitstop -= dt; sdt = 0; } else sdt = dt * rate;
        st += sdt;
        if (phase === "roll") {
          const sl = plan.inSlow(st);
          if (sl !== wasSlow) { wasSlow = sl; sfx(sl ? "slowin" : "slowout", 1, 0.8); }
          while (si < plan.shots.length && plan.shots[si].t0 <= st) startShot(plan.shots[si++]);
          plan.update(st);
          crowdDeaths();
          const R = plan.stormR(st);
          world.setStorm(R, clamp((st - 0.5) / 2.5, 0, 1));
          stormLevel(clamp((160 - R) / 140, 0.1, 0.9));
        }
      }
    } else {
      idleCam();
      for (let i = idleQ.length - 1; i >= 0; i--) if (idleQ[i].t <= now) { const q = idleQ[i]; idleQ.splice(i, 1); q.fn(); }
      idleHeroes(dt);
      st += dt;
    }
    // heroes
    for (const f of heroes) {
      if (!f.alive) { f.label.style.display = "none"; continue; }
      if (f.dropAt !== undefined && phase === "roll") {
        if (st < f.dropAt) { f.root.visible = false; continue; }
        if (!f.root.visible) {
          f.root.visible = true; f.pos.y = ground(f.pos.x, f.pos.z) + 42;
          f.mode = "air"; f.clip = null; f.ct = 0; f.vel.set(0, -26, 0); f.lethal = false; f.from.set(f.cur); f.blendT = 0; f.blendDur = 0.06; f.airY = f.pos.y;
          if (f === S.dropHero) sfx("drop", 1, 0.8);
        }
        if (f.mode === "air" && f.dropping && sdt > 0) for (let k = 0; k < 3; k++) fx.add.spawn(f.pos.x + (Math.random() - 0.5) * 0.5, f.pos.y + 1 + Math.random() * 1.5, f.pos.z + (Math.random() - 0.5) * 0.5, 0, 2, 0, 0.5, 0.35 + Math.random() * 0.3, 2.4, 0.9, 0.25, 1, 0, 2);
        if (f.mode === "kneel" && st > (f.kneelUntil || 0)) f.setMode("idle");
      }
      f.update(sdt, st);
    }
    if (phase !== "idle") updateCount();
    crowd.update(st, sdt);
    // camera
    let blur;
    if (shot && shot.kind === "poi") blur = moveCam(dt, desiredPoi(shot, now - shotStart));
    else blur = updateCamera(dt);
    const focus = camFocus();
    world.key.intensity = phase === "idle" ? 0 : 26;
    world.update(now, dt, focus, camera);
    { const up = clamp((camera.position.y - 14) / 36, 0, 1); renderer.toneMappingExposure = 1.4 + 0.5 * up; scene.fog.density = 0.0065 * (1 - 0.65 * up); scene.background.copy(BG0).lerp(BG1, up); scene.fog.color.copy(FOG0).lerp(BG1, up); }
    fx.update(sdt, camera);
    // post
    const slow = phase === "roll" && rate < 0.6;
    const u = finalPass.uniforms;
    u.uBlur.value += ((blur || 0) + (slow && !RM ? 0.25 : 0) - u.uBlur.value) * Math.min(1, dt * 12);
    u.uSat.value += ((slow ? 0.72 : 1) - u.uSat.value) * Math.min(1, dt * 6);
    u.uWarm.value += ((slow ? 0.8 : 0) - u.uWarm.value) * Math.min(1, dt * 6);
    u.uVig.value += ((slow || lbOn ? 1.0 : 0.6) - u.uVig.value) * Math.min(1, dt * 4);
    composer.render();
    // HUD
    labels();
    if (el.banner.classList.contains("on") && now > bannerT) el.banner.classList.remove("on");
    if (koT && now - koT > 1.3) { el.ko.classList.remove("on"); koT = 0; }
    if (flashT) { const k = 1 - (now - flashT) / 0.35; el.flash.style.opacity = Math.max(0, k * 0.3); if (k <= 0) flashT = 0; }
    for (const s of vsSide) if (s.f) { s.hpShown += (s.f.hp - s.hpShown) * Math.min(1, dt * 10); s.hp.style.width = (s.hpShown * 100).toFixed(1) + "%"; s.hp.classList.toggle("low", s.hpShown < 0.3); }
    for (const k of el.feed.children) if (now - k._t > 6) k.classList.add("old");
  }
  function moveCam(dt, fov) {
    world.clearView(P, L);
    let blur = 0;
    if (fly && fly.t < fly.dur) {
      fly.t += dt; const u = smooth(clamp(fly.t / fly.dur, 0, 1)), dist = fly.pos.distanceTo(P);
      ap.copy(fly.pos).lerp(P, 0.5); ap.y = Math.max(fly.pos.y, P.y) + dist * 0.22 + 3;
      cam.pos.copy(fly.pos).multiplyScalar((1 - u) * (1 - u)).addScaledVector(ap, 2 * u * (1 - u)).addScaledVector(P, u * u);
      cam.look.copy(fly.look).lerp(L, u); cam.fov = fly.fov + (fov - fly.fov) * u;
      blur = RM ? 0 : Math.sin(u * Math.PI) * Math.min(1, dist / 40) * 0.6;
    } else { const k = 1 - Math.exp(-dt * 3); cam.pos.lerp(P, k); cam.look.lerp(L, k); cam.fov += (fov - cam.fov) * k; }
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    return blur;
  }
  const focusV = new THREE.Vector3();
  function camFocus() {
    // where the shadow camera and the warm key light follow: what we look at, on the ground
    focusV.copy(cam.look); focusV.y = ground(focusV.x, focusV.z);
    if (camera.position.y > 40) focusV.set(0, AY, 0);
    return focusV;
  }
  const tags = [], placed = [], cand = [], wp = new THREE.Vector3();
  function tag(i) {
    let e = tags[i];
    if (!e) { e = document.createElement("div"); e.className = "r3-lbl r3-cl"; e.innerHTML = "<b></b>"; e._b = e.firstChild; e._n = ""; labelsEl.append(e); tags[i] = e; }
    return e;
  }
  function fits(x, y, w, h) {
    for (const r of placed) if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return false;
    placed.push([x, y, w, h]); return true;
  }
  /** a masked username reads as a nick (@abc***), a real name stays a name */
  function nick(p) { const n = String(p.name || ""); return n.endsWith("***") && n[0] !== "@" ? "@" + n : n; }
  function labels() {
    const idle = phase === "idle", far = idle ? 170 : 45;
    cand.length = 0; placed.length = 0;
    if (idle) placed.push([W / 2 - 320, H - 120, 640, 90]); // keep the lobby caption clear
    for (const f of heroes) {
      f.label.style.display = "none";
      if (!f.alive || !f.root.visible || f.dying || phase === "win") continue;
      wp.copy(f.pos); wp.y += 2.05 * f.scale;
      const d = camera.position.distanceTo(wp);
      if (d > far) continue;
      pv.copy(wp).project(camera);
      if (pv.z > 1 || Math.abs(pv.x) > 1.02 || Math.abs(pv.y) > 1.02) continue;
      cand.push({ f, d, x: pv.x, y: pv.y, w: wp.clone(), pr: d * 0.6 });
    }
    if (idle) for (const q of crowd.list) {
      wp.set(q.x, q.y + 1.75, q.z);
      const d = camera.position.distanceTo(wp);
      if (d > far) continue;
      pv.copy(wp).project(camera);
      if (pv.z > 1 || Math.abs(pv.x) > 0.98 || Math.abs(pv.y) > 0.95) continue;
      cand.push({ q, d, x: pv.x, y: pv.y, w: wp.clone(), pr: d });
    }
    cand.sort((a, b) => a.pr - b.pr);
    let ti = 0, shown = 0;
    const cap = idle ? 70 : 10;
    for (const c of cand) {
      if (shown >= cap) break;
      const sx = ((c.x + 1) / 2) * W, sy = ((1 - c.y) / 2) * H;
      const k = c.f ? clamp(22 / Math.max(6, c.d), idle ? 0.6 : 0.55, 1.15) : clamp(34 / Math.max(8, c.d), 0.62, 1.05);
      const name = nick(c.f ? c.f.p : c.q.p);
      const w = (Math.min(name.length, 18) * (c.f ? 13 : 11) + 14) * k, h = (c.f && !idle ? 36 : 26) * k;
      if (!fits(sx - w / 2, sy - h, w, h)) continue;
      if (world.occluded(camera.position, c.w)) { placed.pop(); continue; }
      shown++;
      const tf = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${k.toFixed(3)})`;
      if (c.f) {
        const lb = c.f.label; lb.style.display = ""; lb.style.transform = tf;
        c.f.lhp.style.width = (c.f.hp * 100).toFixed(0) + "%"; lb.classList.toggle("hurt", c.f.hp < 0.35);
      } else {
        const e = tag(ti++);
        if (e._n !== name) { e._n = name; e._b.textContent = name; e.className = "r3-lbl r3-cl" + (c.q.tier > 0 ? " t" + c.q.tier : ""); }
        e.style.display = ""; e.style.transform = tf;
      }
    }
    for (let i = ti; i < tags.length; i++) if (tags[i].style.display !== "none") tags[i].style.display = "none";
  }

  root._r3h = () => heroes;
  root._r3 = () => ({ st, phase, tEnd: plan?.tEnd, tWin: plan?.tWin, finalAt: plan?.finalAt, qual, shot: shot?.kind });
  root.classList.add("idle");
  raf = requestAnimationFrame((t) => { last = t; frame(t); });
  const onVis = () => { last = performance.now(); };
  document.addEventListener("visibilitychange", onVis);

  return {
    setParticipants,
    roll,
    reset,
    setPrize,
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVis);
      stopAll();
      for (const f of heroes) f.dispose();
      crowd.dispose();
      composer.dispose?.(); rt.dispose(); renderer.dispose(); disposeTex();
      link.remove(); root.innerHTML = ""; root.classList.remove("r3-root", "idle", "lb");
    },
  };
}
