// Режисер ролу: заздалегідь розписує всі бої, шторм, слоумо і план камери під заданого переможця.
// Переможець не може програти: його HP ніколи не падає нижче 12 %, і кожен бій із ним він закінчує сам.
// Час — «симуляційний» (st): у слоумо він іде повільніше, камера ж рухається в реальному часі.
import { CLIPS } from "./fighter.js";
import { sfx } from "./audio.js";
import { ARENA_R } from "./world.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ORB = 0.24; // flight time of a staff orb

export function makeRoll(S, W, info, rnd) {
  const q = []; // scheduled commands
  const at = (t, fn) => { q.push({ t, fn }); };
  const shots = [], slows = [], banners = [];
  const heroes = S.heroes;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const AY = S.arenaY;
  const minHp = (f) => (f.fin ? 0.12 : 0.06);

  // ---------- cast ----------
  const others = heroes.filter((f) => f !== W);
  const k = Math.min(5, heroes.length);
  const ranked = others.slice().sort((a, b) => (b.p.tickets || 1) + rnd() * 3 - ((a.p.tickets || 1) + rnd() * 3));
  const D = ranked.slice(0, k - 1); // decoys that reach the final; D[0] is the last opponent
  const FIN = [W, ...D];
  const losers = ranked.slice(k - 1);
  for (const f of heroes) { f.fin = FIN.includes(f); f.hp = 1; f.busy = []; }
  const C = Math.min(losers.length, 4);
  const camLosers = shuffle(losers.slice().sort((a, b) => (b.p.tickets || 1) - (a.p.tickets || 1)).slice(0, C));
  const offLosers = losers.filter((f) => !camLosers.includes(f));
  const killOrder = shuffle(FIN.slice()); // every finalist gets one bout on camera, so screen time gives nothing away
  const busy = (f, t0, t1) => f.busy.push([t0, t1]);
  const isBusy = (f, t0, t1) => f.busy.some(([a, b]) => a < t1 && b > t0);

  // ---------- strikes ----------
  const v = { x: 0, y: 0, z: 0 };
  function contact(a, b) {
    const ca = a.chest({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
    const cb = b.chest({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
    v.x = ca.x + (cb.x - ca.x) * 0.72; v.y = (ca.y + cb.y) / 2 + 0.05; v.z = ca.z + (cb.z - ca.z) * 0.72;
    return v;
  }
  const dirOf = (a, b) => { const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1; return { x: dx / d, z: dz / d }; };
  function hurt(f, dmg) { f.hp = Math.max(minHp(f), f.hp - dmg); S.hud.hp(f); }

  /** One attack with its outcome. react: block | hit | heavy | dodge | dodgeBack | parry | ko | down | miss */
  function strike(att, vic, t, clip, react, o = {}) {
    const c = CLIPS[clip], th = t + c.hit + (clip === "cast" ? ORB : 0);
    at(t, () => {
      if (!att.alive || att.dying) return;
      let adv;
      if (o.leap) { const d = Math.hypot(vic.pos.x - att.pos.x, vic.pos.z - att.pos.z); adv = [0.2, 0.86, Math.max(0, d - 1.2) / att.scale, 0]; }
      att.faceTo(vic.pos.x, vic.pos.z);
      att.play(clip, "guard", adv);
    });
    if (clip === "cast") at(t + c.hit, () => { if (!att.alive) return; S.fx.orb(att.tip.getWorldPosition(S.tmp()), vic.chest(S.tmp()), ORB, att.mats.orb.color.getHex(), null); sfx("cast", S.rate()); });
    else at(th - 0.09, () => sfx("whoosh", S.rate(), o.onCam ? 1 : 0.35));
    const cam = o.onCam ? 1 : 0.3;
    if (react === "block") {
      at(th - 0.15, () => vic.alive && vic.play("block", "guard"));
      at(th, () => { if (!vic.alive) return; const p = contact(att, vic); S.fx.sparks(p.x, p.y, p.z, 26, [2.6, 1.6, 0.7], 6); S.fx.flash(p.x, p.y, p.z, 1.1, 0xffe0b0, 0.1); sfx("clang", S.rate(), cam); vic.play("blockHit", "guard"); if (o.onCam) { S.shake(0.08); S.hitstop(0.04); } });
    } else if (react === "hit" || react === "heavy") {
      at(th, () => {
        if (!vic.alive) return; const p = contact(att, vic), d = dirOf(att, vic), heavy = react === "heavy";
        vic.play(heavy ? "hitH" : "hitL", "guard"); hurt(vic, o.dmg ?? (heavy ? 0.2 : 0.13));
        S.fx.sparks(p.x, p.y, p.z, heavy ? 34 : 20, [2.4, 1.0, 0.35], heavy ? 7 : 5, d); S.fx.flash(p.x, p.y, p.z, heavy ? 1.8 : 1.2, 0xffb070, 0.12);
        if (heavy) S.fx.puff(vic.pos.x, vic.pos.y, vic.pos.z, 8, 0.7, 2);
        sfx(heavy ? "heavy" : "hit", S.rate(), cam); S.hud.combo(att, vic);
        if (o.onCam) { S.shake(heavy ? 0.28 : 0.14); S.hitstop(heavy ? 0.085 : 0.05); }
      });
    } else if (react === "dodge" || react === "dodgeBack") {
      at(th - 0.24, () => vic.alive && vic.play(react === "dodge" ? "dodgeSide" : "dodgeBack", "guard"));
    } else if (react === "parry") {
      at(th - 0.1, () => vic.alive && vic.play("parry", "guard"));
      at(th, () => { const p = contact(att, vic); S.fx.sparks(p.x, p.y, p.z, 40, [2.8, 1.8, 0.8], 8); S.fx.flash(p.x, p.y, p.z, 2, 0xfff0d0, 0.14); sfx("clang", S.rate(), cam); att.play("hitL", "guard"); if (o.onCam) { S.shake(0.2); S.hitstop(0.08); } });
    } else if (react === "ko" || react === "down") {
      at(th, () => {
        if (!vic.alive) return; const p = contact(att, vic), d = dirOf(att, vic), lethal = react === "ko";
        if (lethal) { vic.hp = 0; S.hud.hp(vic); } else hurt(vic, o.dmg ?? 0.35);
        vic.launch(d.x, d.z, o.power ?? 6, lethal);
        if (o.up) vic.vel.y = o.up;
        S.fx.sparks(p.x, p.y, p.z, 60, [2.8, 1.3, 0.45], 9, d); S.fx.flash(p.x, p.y, p.z, 3.2, 0xffc890, 0.2);
        S.fx.ring(vic.pos.x, vic.pos.y, vic.pos.z, 5, 0xff9a40, 0.6);
        if (o.ring) { S.fx.ring(att.pos.x, att.pos.y, att.pos.z, 9, 0xffb060, 0.9); S.fx.puff(att.pos.x, att.pos.y, att.pos.z, 26, 1.3, 5); }
        sfx(lethal ? "ko" : "heavy", S.rate(), o.onCam || lethal ? 1 : 0.4);
        S.hud.combo(att, vic);
        if (o.onCam || lethal) { S.shake(lethal ? 0.6 : 0.4); S.hitstop(lethal ? 0.12 : 0.08); }
        if (lethal) S.ko(att, vic, !!o.onCam);
      });
    } else if (react === "miss") {
      at(th, () => { S.fx.ring(att.pos.x, att.pos.y, att.pos.z, 8, 0xff9a40, 0.8); S.fx.puff(att.pos.x, att.pos.y, att.pos.z, 30, 1.4, 6); sfx("heavy", S.rate()); if (o.onCam) { S.shake(0.5); S.hitstop(0.06); } });
    }
    return th;
  }

  // ---------- beats ----------
  const BEATS = {
    combo(K, V, t, o) { strike(K, V, t, "slashR", "block", o); strike(K, V, t + 0.42, "slashL", rnd() < 0.5 ? "block" : "hit", { ...o, dmg: 0.12 }); strike(K, V, t + 0.86, "thrust", "hit", { ...o, dmg: 0.16 }); return 1.44; },
    counter(K, V, t, o) { strike(V, K, t, "slashR", "block", o); strike(K, V, t + 0.5, "overhead", "heavy", { ...o, dmg: 0.2 }); return 1.32; },
    dodge(K, V, t, o) { strike(V, K, t, "thrust", "dodge", o); strike(K, V, t + 0.52, "slashL", "hit", { ...o, dmg: 0.15 }); return 1.1; },
    clash(K, V, t, o) {
      at(t, () => { if (K.alive && V.alive) { K.play("slashR", "guard"); V.play("slashL", "guard"); } });
      at(t + 0.18, () => sfx("whoosh", S.rate()));
      at(t + 0.26, () => { if (!K.alive || !V.alive) return; const p = contact(K, V); p.x = (K.pos.x + V.pos.x) / 2; p.z = (K.pos.z + V.pos.z) / 2; S.fx.sparks(p.x, p.y + 0.2, p.z, 60, [2.8, 1.9, 0.9], 9); S.fx.flash(p.x, p.y + 0.2, p.z, 2.6, 0xfff0d0, 0.16); sfx("clang", S.rate()); if (o.onCam) { S.shake(0.3); S.hitstop(0.1); } });
      at(t + 0.3, () => { K.play("blockHit", "guard"); V.play("blockHit", "guard"); });
      return 0.86;
    },
    kick(K, V, t, o) { strike(K, V, t, "kick", "heavy", { ...o, dmg: 0.12 }); return 0.76; },
    parry(K, V, t, o) { strike(V, K, t, "overhead", "parry", o); strike(K, V, t + 0.64, "thrust", "hit", { ...o, dmg: 0.16 }); return 1.24; },
    trade(K, V, t, o) { strike(V, K, t, "slashR", "hit", { ...o, dmg: 0.1 }); strike(K, V, t + 0.55, "slashL", "heavy", { ...o, dmg: 0.18 }); return 1.2; },
    cast(K, V, t, o) { strike(K, V, t, "cast", rnd() < 0.4 ? "block" : "hit", { ...o, dmg: 0.15 }); return 0.98; },
  };
  const POOL = ["combo", "counter", "dodge", "clash", "kick", "parry", "trade"];
  function beats(K, V, t, n, o) {
    let prev = "";
    for (let i = 0; i < n; i++) {
      let b = K.weapon === "staff" && rnd() < 0.4 ? "cast" : pick(POOL);
      if (b === prev) b = POOL[(POOL.indexOf(b) + 1) % POOL.length];
      prev = b;
      t += BEATS[b](K, V, t, o) + 0.1 + rnd() * 0.18;
    }
    return t;
  }
  /** Returns the time of the decisive hit. */
  function finisher(K, V, t, o, kind) {
    kind ||= K.weapon === "staff" && rnd() < 0.5 ? "cast" : pick(["spin", "uppercut", "overhead", "leap", "thrust"]);
    const oo = { ...o, power: 6.5 };
    if (kind === "leap") { strike(V, K, t, "slashR", "dodgeBack", o); return strike(K, V, t + 0.55, "leap", "ko", { ...oo, leap: true, ring: true, power: 8 }); }
    if (kind === "uppercut") return strike(K, V, t, "uppercut", "ko", { ...oo, power: 3.5, up: 10 });
    if (kind === "spin") return strike(K, V, t, "spin", "ko", { ...oo, power: 8 });
    if (kind === "cast") return strike(K, V, t, "cast", "ko", { ...oo, power: 7 });
    return strike(K, V, t, kind, "ko", oo);
  }
  function slow(th, before, after, scale) { slows.push({ t0: th - before, t1: th + after, scale }); }

  /** A full bout K beats V starting at t (they already stand close). */
  function bout(K, V, t, o) {
    at(t, () => { if (!K.alive || !V.alive) return; K.engage(V); V.engage(K); const c = rnd() < 0.5 ? 0.6 : -0.6; K.circle = c; V.circle = c; if (o.onCam) S.hud.vs(K, V); });
    let tc = beats(K, V, t + 0.3, o.n ?? 2, o);
    const tFin = tc;
    const th = finisher(K, V, tc, o, o.kind);
    if (o.slow) slow(th, 0.28, 0.42, o.slow);
    at(th + 0.05, () => { K.circle = 0; V.circle = 0; K.opp = null; K.setMode("guard"); });
    busy(K, t - 4, th + 1.5); busy(V, t - 4, th + 1.5);
    return { tFin, th };
  }

  /** Put a and b near point (x,z) facing each other, `gap` apart, then let them run in. */
  function stage(a, b, x, z, t, gap = 7) {
    at(t, () => {
      const ang = rnd() * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
      for (const [f, s] of [[a, 1], [b, -1]]) {
        if (!f.alive) continue;
        const tx = x + dx * s * 0.95, tz = z + dz * s * 0.95;
        if (!S.visible(f) || Math.hypot(f.pos.x - tx, f.pos.z - tz) > 14) f.place(x + dx * s * gap / 2, z + dz * s * gap / 2, Math.atan2(-dx * s, -dz * s));
        f.runTo(tx, tz, 7.5);
      }
    });
  }

  // ---------- timeline ----------
  const T0 = 4.8;
  let tc = T0;
  const R0 = 150;
  const keys = [[0, R0], [T0, R0]];
  // intro: everybody drops from the sky onto their spots
  at(0, () => { S.dropAll(0.2, 3.4); });
  shots.push({ t0: 0, kind: "drop", cut: true });
  shots.push({ t0: 2.7, kind: "aerial", r: 95, h: 62, a0: 0.6, w: 0.1, fly: true });
  banners.push([0.4, `РАУНД ${info.round}/${info.totalRounds}`, "big", 2.4]);
  banners.push([2.9, "ШТОРМ НАСУВАЄТЬСЯ", "red", 2.4]);

  const POIS = S.world.POIS;
  const poiOrder = shuffle(POIS.slice());
  const C1 = Math.ceil(C / 2);
  for (let i = 0; i < C; i++) {
    const V = camLosers[i];
    const K = killOrder[i % killOrder.length];
    if (i === C1) { // storm shot between the waves
      shots.push({ t0: tc, kind: "aerial", r: 80, h: 70, a0: rnd() * 6, w: 0.14, fly: true });
      banners.push([tc + 0.4, "ЗОНА 2 · ТІСНІШЕ", "red", 2.4]);
      tc += 2.6;
    }
    const ph2 = i >= C1;
    const poi = poiOrder[i % poiOrder.length];
    const L = Math.hypot(poi.x, poi.z), f = ph2 ? 0.36 : 0.86;
    const mx = (poi.x / L) * L * f + (ph2 ? (rnd() - 0.5) * 6 : 0), mz = (poi.z / L) * L * f;
    const s0 = tc, b0 = s0 + 1.15;
    stage(K, V, mx, mz, s0 - 1.6, 7);
    at(s0 - 0.2, () => S.clearCrowd(mx, mz, 5));
    const { tFin, th } = bout(K, V, b0, { onCam: true, n: 2, slow: 0.3 });
    const side = i % 2 ? -1 : 1;
    shots.push({ t0: s0, kind: "duel", a: K, b: V, side, fly: true, loc: ph2 ? `Дорога: ${poi.n}` : poi.n });
    shots.push({ t0: tFin - 0.05, kind: i % 2 ? "low" : "orbit", a: K, b: V, r: 4.6, h: 1.5, w: 0.8 * side, cut: true, loc: ph2 ? `Дорога: ${poi.n}` : poi.n });
    at(th + 1.2, () => S.hud.vs(null));
    tc = th + 1.55;
    if (i === C1 - 1 || (C1 === 0 && i === 0)) keys.push([tc, 70]);
  }
  if (C === 0) { shots.push({ t0: tc, kind: "aerial", r: 80, h: 70, a0: 2, w: 0.14, fly: true }); banners.push([tc + 0.3, "ЗОНА ЗВУЖУЄТЬСЯ", "red", 2.4]); tc += 3; keys.push([tc, 70]); }
  // last wave
  shots.push({ t0: tc, kind: "aerial", r: 55, h: 58, a0: rnd() * 6, w: -0.16, fly: true });
  banners.push([tc + 0.3, "ОСТАННЯ ЗОНА", "red", 2.4]);
  keys.push([tc + 2.6, 36]);
  tc += 2.6;

  // off-camera bouts and storm losses, spread over the waves
  const tEndWaves = tc;
  offLosers.forEach((V, j) => {
    const t = T0 + 1.5 + ((j + 0.5) * (tEndWaves - T0 - 3)) / Math.max(1, offLosers.length);
    const K = FIN.find((f) => !isBusy(f, t - 3, t + 4)) || losers.find((f) => f !== V && !isBusy(f, t - 3, t + 4) && !offLosers.slice(0, j + 1).includes(f));
    if (!K) { at(t, () => { if (V.alive) { S.fx.ring(V.pos.x, V.pos.y, V.pos.z, 4, 0xb070ff, 0.8); V.launch(0, 1, 2, true); S.ko(null, V, false); } }); return; }
    at(t - 1.4, () => {
      if (!V.alive || !K.alive) return;
      const ang = rnd() * 6.283, x = V.pos.x, z = V.pos.z;
      if (!S.visible(K)) K.place(x + Math.cos(ang) * 6, z + Math.sin(ang) * 6, ang + Math.PI);
      K.runTo(x + Math.cos(ang) * 1.2, z + Math.sin(ang) * 1.2, 7.5); V.faceTo(K.pos.x, K.pos.z);
    });
    bout(K, V, t, { onCam: false, n: 1 });
  });

  // ---------- final ----------
  const tConv = tc;
  keys.push([tConv + 3.6, 23]);
  // safety: a bout whose killer died first leaves its victim standing — the storm takes them
  at(tConv - 0.9, () => {
    for (const f of S.heroes) if (f.alive && !f.dying && f.hp > 0 && !FIN.includes(f)) { S.fx.ring(f.pos.x, f.pos.y, f.pos.z, 4, 0xb070ff, 0.8); f.launch(0, 1, 2, true); S.ko(null, f, false); }
  });
  // finalists come in from all sides
  at(tConv - 0.6, () => {
    const a0 = rnd() * 6.283;
    FIN.forEach((f, i) => {
      if (!f.alive) return;
      const a = a0 + (i / FIN.length) * Math.PI * 2;
      if (!S.visible(f)) f.place(Math.cos(a) * 30, Math.sin(a) * 30, a + Math.PI);
      f.opp = null; f.runTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 8.2);
    });
  });
  shots.push({ t0: tConv, kind: "gate", fly: true, loc: "Арена" });
  banners.push([tConv + 0.3, "ВСІ НА АРЕНУ", "red", 2.2]);
  tc = tConv + 4.0;
  at(tc - 0.2, () => S.hud.letterbox(true));
  shots.push({ t0: tc, kind: "arena", r: 17, h: 6.2, a0: rnd() * 6, w: 0.22, cut: true, loc: "Арена" });
  banners.push([tc + 0.2, FIN.length > 1 ? `ФІНАЛ · ЛИШИЛОСЬ ${FIN.length}` : "ФІНАЛ", "big", 2.6]);
  at(tc, () => { sfx("ko", 1, 0.6); S.drum(true); });

  let alive = FIN.slice();
  const spars = (busyPair, t0, t1) => {
    const rest = alive.filter((f) => !busyPair.includes(f));
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const a = rest[i], b = rest[i + 1];
      at(t0, () => { if (a.alive && b.alive) { a.engage(b, 1.9); b.engage(a, 1.9); a.circle = b.circle = 0.7; } });
      let t = t0 + 0.4;
      while (t < t1 - 1.4) {
        const kk = rnd();
        if (kk < 0.35) t += BEATS.clash(a, b, t, {}); else if (kk < 0.7) { strike(a, b, t, "slashR", "block"); t += 0.9; } else { strike(b, a, t, "thrust", "dodge"); t += 1.0; }
        t += 0.25 + rnd() * 0.4;
      }
    }
    if (rest.length % 2) { const s = rest[rest.length - 1]; at(t0, () => { if (s.alive) { s.engage(busyPair[1], 3.4); s.circle = 0.9; } }); }
  };
  if (FIN.length === 1) {
    tc += 2.4;
  } else {
    tc += 2.8;
    // KOs in the melee, one at a time, each with its own slow motion
    const victims = D.slice(1).reverse();
    victims.forEach((V, m) => {
      const K = m % 2 === 0 ? D[0] : W;
      const t0 = tc;
      spars([K, V], t0 - 0.5, t0 + 4.6);
      at(t0 - 0.5, () => { if (K.alive && V.alive) { K.engage(V); V.engage(K); } });
      const r = bout(K, V, t0, { onCam: true, n: 1, slow: 0.2, kind: pick(["spin", "uppercut", "leap"]) });
      shots.push({ t0: t0 - 0.4, kind: "duel", a: K, b: V, side: m % 2 ? 1 : -1, cut: true, loc: "Арена" });
      shots.push({ t0: r.tFin - 0.05, kind: "orbit", a: K, b: V, r: 4.4, h: 1.4, w: 0.9, cut: true, loc: "Арена" });
      at(r.th + 1.0, () => S.hud.vs(null));
      alive = alive.filter((f) => f !== V);
      tc = r.th + 1.4;
      const left = alive.length;
      shots.push({ t0: tc, kind: "arena", r: 15, h: 5, a0: rnd() * 6, w: 0.3, cut: true, loc: "Арена" });
      banners.push([tc + 0.1, left === 2 ? "ЛИШИЛОСЬ ДВОЄ" : `ЛИШИЛОСЬ ${left}`, "big", 2]);
      tc += 1.4;
    });
    // ---------- the final duel ----------
    const O = D[0];
    const o = { onCam: true };
    at(tc - 0.6, () => { W.engage(O); O.engage(W); W.circle = O.circle = 0.5; S.hud.vs(W, O); });
    shots.push({ t0: tc - 0.6, kind: "duel", a: W, b: O, side: 1, cut: true, loc: "Фінальна дуель" });
    let t = tc;
    t += BEATS.clash(W, O, t, o) + 0.2;
    t += BEATS.combo(O, W, t, o) + 0.15; // the winner takes damage too
    shots.push({ t0: t - 1.6, kind: "ots", a: W, b: O, cut: true, loc: "Фінальна дуель" });
    t += BEATS.counter(W, O, t, o) + 0.2;
    t += BEATS.trade(O, W, t, o) + 0.15;
    // O knocks the winner down, slow motion while O leaps for the finish
    shots.push({ t0: t, kind: "low", a: O, b: W, side: -1, cut: true, loc: "Фінальна дуель" });
    const tk = strike(O, W, t, "kick", "down", { ...o, dmg: 0.5, power: 5 });
    at(tk + 0.05, () => { W.opp = O; O.circle = 0; W.circle = 0; });
    banners.push([tk + 0.15, "НА МЕЖІ!", "red", 1.6]);
    const tl = tk + 0.75;
    strike(O, W, tl, "leap", "miss", { ...o, leap: true });
    at(tl + 0.5, () => { if (W.alive) { W.faceTo(O.pos.x, O.pos.z); W.play("roll", "guard"); } });
    slow(tl + CLIPS.leap.hit, 0.6, 0.3, 0.22);
    shots.push({ t0: tl + 0.15, kind: "orbit", a: O, b: W, r: 5, h: 0.9, w: -0.7, cut: true, loc: "Фінальна дуель" });
    t = tl + CLIPS.leap.dur + 0.35;
    at(t - 0.15, () => { W.engage(O); O.engage(W); });
    shots.push({ t0: t, kind: "duel", a: W, b: O, side: -1, cut: true, loc: "Фінальна дуель" });
    // comeback
    strike(W, O, t, "slashR", "hit", { ...o, dmg: 0.25 });
    strike(W, O, t + 0.42, "slashL", "hit", { ...o, dmg: 0.25 });
    t += 0.95;
    const fk = W.weapon === "staff" ? "cast" : pick(["spin", "uppercut"]);
    shots.push({ t0: t - 0.05, kind: "orbit", a: W, b: O, r: 4.2, h: 1.25, w: 0.75, cut: true, loc: "Фінальна дуель" });
    const thw = finisher(W, O, t, o, fk);
    slow(thw, 0.32, 0.55, 0.11);
    at(thw, () => { S.drum(false); });
    tc = thw + 1.5;
  }
  // victory
  at(tc - 0.3, () => { S.hud.vs(null); W.opp = null; W.faceTo(W.pos.x + Math.sin(W.yaw) * 5, W.pos.z + Math.cos(W.yaw) * 5); W.victory(); });
  shots.push({ t0: tc - 0.3, kind: "hero", a: W, cut: true, loc: "" });
  const tWin = tc + 0.9;
  at(tWin, () => S.showWin());
  const tEnd = tWin + 1.2;

  q.sort((a, b) => a.t - b.t);
  shots.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < shots.length; i++) shots[i].t1 = i + 1 < shots.length ? shots[i + 1].t0 : 1e9;
  banners.sort((a, b) => a[0] - b[0]);
  // storm radius over time
  keys.sort((a, b) => a[0] - b[0]);
  const stormR = (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, r0] = keys[i - 1], [t1, r1] = keys[i]; const u = clamp((t - t0) / (t1 - t0), 0, 1); return r0 + (r1 - r0) * (u * u * (3 - 2 * u)); }
    return keys[keys.length - 1][1];
  };
  const timeScale = (t) => {
    let s = 1;
    for (const w of slows) {
      if (t < w.t0 - 0.12 || t > w.t1 + 0.12) continue;
      const u = t < w.t0 ? (w.t0 - t) / 0.12 : t > w.t1 ? (t - w.t1) / 0.12 : 0;
      s = Math.min(s, w.scale + (1 - w.scale) * clamp(u, 0, 1));
    }
    return s;
  };

  let qi = 0, bi = 0;
  return {
    shots, keys, stormR, timeScale, tEnd, tWin, finalAt: tConv, wavesEnd: tEndWaves, T0, FIN,
    inSlow: (t) => slows.some((w) => t >= w.t0 && t <= w.t1),
    update(st) {
      while (qi < q.length && q[qi].t <= st) { const c = q[qi++]; try { c.fn(); } catch (e) { console.error(e); } }
      while (bi < banners.length && banners[bi][0] <= st) { const b = banners[bi++]; S.hud.banner(b[1], b[2], b[3]); }
    },
  };
}
