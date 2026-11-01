// Visual "loto": «Лото Забава», a TV lottery show in the 16-bit look of the OBS overlays.
// Idle: a big glass drum turns on its pedestal, numbered balls (one per participant, size by tickets) bounce
// in the air of the blower; the scoreboard on the right maps ball numbers to names and lights them up in turn.
// Roll: the drum spins up and the air goes wild, the vacuum pump switches on, one ball is pulled to the
// mouth and drops back (the fake), then the winner's ball — chosen by the server — is sucked into the
// glass tube, rides the loop, rattles through the pump and drops into the golden cup. Finale: the ball
// flies to the centre, the name huge.
import * as px from "../pixel-kit.js";
import { makeDrum, vaneLines } from "./physics.js";
import * as art from "./art.js";
import { t as tr } from "../../lang.js";
import { makeBoard } from "./board.js";
import { makeFinale } from "./finale.js";

export const meta = { id: "loto", title: "Лото Забава", author: "agent" };

const W = 1920, H = 1080;
const { PAL } = px;
const BALLS = 40;

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);

// roll timeline, seconds from the start
const T = { spin: 1.4, vacuum: 6.0, decoy: 6.3, decoyOff: 7.4, pull: 7.8, force: 9.8, tube: 3.1, pump: 1.2, drop: 0.45, settle: 0.7 };

export function mount(root, ctx) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated";
  root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });
  const reduced = () => !!ctx.reducedMotion;
  const avatarsOn = () => ctx.privacy?.avatars !== false;
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound must never break the show */ } };

  const studio = px.loadImage(px.sceneUrl("loto-studio"));
  const pedestal = px.loadImage(px.spriteUrl("loto-pedestal"));
  const pump = px.loadImage(px.spriteUrl("loto-pump"));
  const holder = px.loadImage(px.spriteUrl("loto-holder"));
  const tubePath = art.buildTube(), dropPath = art.buildDrop();
  const tube = art.renderTube([tubePath, dropPath]);
  const drumL = px.lowres(W, H), frontL = px.lowres(W, H);
  px.ensureFont();

  let S = 1, OX = 0, OY = 0, CW = 1920, CH = 1080;
  function fit() {
    const w = root.clientWidth || ctx.size?.w || innerWidth, h = root.clientHeight || ctx.size?.h || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    CW = Math.round(w * dpr); CH = Math.round(h * dpr);
    canvas.width = CW; canvas.height = CH;
    S = Math.min(CW / W, CH / H); OX = (CW - W * S) / 2; OY = (CH - H * S) / 2;
  }

  // ---------------------------------------------------------------- avatars
  const imgs = new Map();
  function avatarOf(p) {
    if (!avatarsOn() || !p?.avatar) return null;
    let e = imgs.get(p.avatar);
    if (!e) {
      e = { img: new Image(), ok: false };
      e.img.referrerPolicy = "no-referrer";
      e.img.onload = () => { e.ok = true; };
      e.img.src = p.avatar;
      imgs.set(p.avatar, e);
    }
    return e.ok ? e.img : null;
  }

  // ---------------------------------------------------------------- participants → balls
  let participants = [];
  const localWon = new Set();
  const numOf = new Map(); // participant id → ball number (its place in the list, stable for a draw)
  const pool = () => participants.filter((p) => !p.won && !localWon.has(p.id));
  const drum = makeDrum({ cx: art.DRUM.cx, cy: art.DRUM.cy, r: art.DRUM.r });
  let tmax = 1;

  function dress(ball, p) {
    const k = tmax > 1 ? clamp(Math.log(Math.max(1, p.tickets)) / Math.log(tmax)) : 0;
    ball.p = p;
    ball.num = numOf.get(p.id) ?? 0;
    ball.r = Math.round(19 + 13 * k);
    ball.tier = ball.num % 5; // colour is just a lottery colour; tickets show as size and a glow
    ball.big = k > 0.6;
    ball.flash = 0.6;
    return ball;
  }

  function sampleWeighted(list, k) {
    return list.map((p) => ({ p, k: Math.pow(Math.random(), 1 / Math.max(1, p.tickets)) }))
      .sort((a, b) => b.k - a.k).slice(0, k).map((x) => x.p);
  }

  function rebuildBalls() {
    const pl = pool(), byId = new Map(pl.map((p) => [p.id, p]));
    tmax = pl.reduce((m, p) => Math.max(m, p.tickets), 1);
    for (const b of drum.balls.slice()) {
      const p = byId.get(b.p.id);
      if (p) dress(b, p); else drum.remove(b);
    }
    const inDrum = new Set(drum.balls.map((b) => b.p.id));
    const need = Math.min(BALLS, pl.length) - drum.balls.length;
    if (need > 0) for (const p of sampleWeighted(pl.filter((p) => !inDrum.has(p.id)), need)) drum.add(dress({}, p));
  }

  // ---------------------------------------------------------------- state
  let mode = "idle"; // idle | roll | win
  let roll = null;
  let particles = [];
  let flash = 0, shake = 0, nextSwapAt = 0, bumpAt = 0;
  const board = makeBoard({ px, art, W });
  const finale = makeFinale({ px, art, W, H, reduced });

  // ---------------------------------------------------------------- roll
  function startRoll(winner, info, resolve) {
    const now = performance.now() / 1000;
    localWon.delete(winner.id);
    let wb = drum.balls.find((b) => b.p.id === winner.id), swapIn = null;
    if (!wb) {
      // the winner's ball is among those not in the drum right now: swap it in while the air is wild
      const cand = drum.balls.filter((b) => b !== board.spot());
      if (cand.length) { wb = cand[(Math.random() * cand.length) | 0]; swapIn = { ball: wb, p: winner, at: now + 0.9 }; }
      else wb = drum.add(dress({}, winner));
    }
    const others = drum.balls.filter((b) => b !== wb);
    const decoy = others.length ? others.sort((a, b) => a.y - b.y)[Math.min(others.length - 1, (Math.random() * 4) | 0)] : null;
    roll = { swapIn, winner, info, ball: wb, decoy, t0: now, pic: px.prizePicture(info?.prize), phase: "mix", s: 0, said: {}, resolve };
    mode = "roll";
    particles = []; flash = 0; shake = 0;
    root.dataset.phase = "roll"; root.dataset.shownWinner = winner.id;
  }

  const once = (key, fn) => { if (!roll.said[key]) { roll.said[key] = 1; fn(); } };

  function updateRoll(now, dt) {
    const r = roll, t = now - r.t0;
    if (r.swapIn && now >= r.swapIn.at) { dress(r.swapIn.ball, r.swapIn.p); r.swapIn = null; }
    // drum speed and air
    if (r.phase === "mix" || r.phase === "suck") {
      const up = smooth(t / T.spin), calm = smooth((t - T.vacuum) / 0.8);
      drum.omega = lerp(0.35, 2.4, up) - 1.6 * calm;
      drum.air = lerp(0.1, 1, up) - 0.62 * calm;
      once("drum0", () => snd("drum"));
      once("whoosh0", () => snd("whoosh"));
    }
    if (t > T.vacuum) { once("vac", () => { snd("whoosh"); board.say(tr("ВМИКАЄМО ВАКУУМ", "ВКЛЮЧАЕМ ВАКУУМ")); }); r.phase = r.phase === "mix" ? "suck" : r.phase; }
    if (r.phase === "suck") {
      const m = art.MOUTH;
      if (r.decoy && t > T.decoy && t < T.decoyOff) drum.pull = { ball: r.decoy, x: m.x, y: m.y + 60, k: 5200 * smooth((t - T.decoy) / 0.5), solid: true };
      else if (t >= T.decoyOff && t < T.pull) {
        drum.pull = null;
        once("decoyOff", () => { if (r.decoy) { snd("drum"); r.decoy.vy += 500; board.say(tr("НІ, НЕ ЦЯ…", "НЕТ, НЕ ЭТОТ…")); shake = reduced() ? 0 : 0.35; } });
      } else if (t >= T.pull) {
        const solid = t < T.pull + 0.9;
        drum.pull = { ball: r.ball, x: m.x, y: m.y, k: lerp(4000, 16000, smooth((t - T.pull) / 1.6)), solid };
        once("pull", () => board.say(tr("ТЯГНЕ!", "ТЯНЕТ!")));
        const d = Math.hypot(r.ball.x - m.x, r.ball.y - m.y);
        if (d < 16 || t > T.force) capture(now);
      }
    } else if (r.phase === "tube") {
      const u = clamp((now - r.tt) / T.tube);
      // brisk start, steady through the loop, slows into the pump
      const f = 0.55 * u + 0.45 * (1 - Math.pow(1 - u, 2.2));
      r.s = f * tubePath.length;
      r.ball.spin += dt * 14;
      if (u >= 1) { r.phase = "pump"; r.tp = now; snd("drum"); board.say(tr("ПЕРЕВІРКА…", "ПРОВЕРКА…")); }
    } else if (r.phase === "pump") {
      if (now - r.tp > T.pump) { r.phase = "drop"; r.td = now; snd("whoosh"); }
    } else if (r.phase === "drop") {
      const u = (now - r.td) / T.drop;
      if (u >= 1) { r.phase = "settle"; r.ts = now; snd("tick"); burst(art.HOLDER.cx, art.HOLDER.top + 10, reduced() ? 40 : 90, 0.5); board.say(tr("Є ПЕРЕМОЖЕЦЬ!", "ЕСТЬ ПОБЕДИТЕЛЬ!")); }
    } else if (r.phase === "settle") {
      if (now - r.ts > T.settle) reveal(now);
    }
    if (r.phase === "mix" || r.phase === "suck") drum.omega = Math.max(0.2, drum.omega);
  }

  function capture(now) {
    const r = roll;
    drum.pull = null;
    drum.remove(r.ball);
    r.phase = "tube"; r.tt = now;
    snd("whoosh");
    board.say(tr("ЛЕТИТЬ!", "ЛЕТИТ!"));
    drum.omega = 0.5; drum.air = 0.15;
  }

  function reveal(now) {
    const r = roll;
    mode = "win"; r.phase = "win";
    const from = { x: art.HOLDER.cx, y: restY(r.ball) };
    finale.start(now, r.winner, r.ball, from, r.info, r.pic, avatarOf(r.winner));
    burst(W / 2, 380, reduced() ? 160 : 340, 1);
    if (!reduced()) { flash = 1; shake = 1; }
    snd("boom"); setTimeout(() => snd("win"), 350);
    root.dataset.phase = "win";
    setTimeout(() => { if (roll === r && !r.done) { r.done = true; r.resolve?.(); } }, 2000);
  }

  const restY = (b) => art.HOLDER.top + 22 - b.r * 0.55;

  /** Where the rolled ball is now (tube / pump / drop / cup), or null while it is in the drum. */
  function ballPos(now) {
    const r = roll;
    if (!r) return null;
    if (r.phase === "tube") return art.at(tubePath, r.s);
    if (r.phase === "pump") return null; // hidden inside the pump
    if (r.phase === "drop") { const u = clamp((now - r.td) / T.drop); return { x: art.PUMP_OUT.x, y: lerp(art.PUMP_OUT.y, restY(r.ball), u * u) }; }
    if (r.phase === "settle" || r.phase === "win") {
      const u = (now - (r.ts ?? now)), bounce = Math.abs(Math.sin(u * 14)) * 26 * Math.exp(-u * 6);
      return { x: art.HOLDER.cx, y: restY(r.ball) - bounce };
    }
    return null;
  }

  // ---------------------------------------------------------------- particles
  function burst(x, y, n, power = 1) {
    const cols = [PAL.orange, "#ff8a1f", PAL.amber, PAL.gold, PAL.slime, PAL.violet, PAL.bone];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = rnd(160, 1400) * power;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 240, g: rnd(500, 1100), life: 0, max: rnd(0.9, 2.4), sz: Math.random() < 0.3 ? 8 : 4, col: cols[(Math.random() * cols.length) | 0], drag: rnd(0.4, 1.1) });
    }
    if (particles.length > 1200) particles.splice(0, particles.length - 1200);
  }
  function drawParticles(dt) {
    let w = 0;
    for (const p of particles) {
      p.life += dt; if (p.life >= p.max) continue;
      p.vx *= Math.pow(0.3, dt * p.drag); p.vy = p.vy * Math.pow(0.3, dt * p.drag) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      g.globalAlpha = Math.round((1 - p.life / p.max) * 4) / 4;
      px.ember(g, p.x, p.y, p.sz, p.col);
      particles[w++] = p;
    }
    particles.length = w;
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- scene
  function sprite(img, x, y, w) {
    if (!px.ready(img)) return 0;
    const h = (w * img.naturalHeight) / img.naturalWidth;
    g.drawImage(img, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    return h;
  }

  function drawScene(now, dt) {
    const busy = mode !== "idle";
    px.cover(g, studio, 0, 0, W, H);
    g.fillStyle = PAL.ink; g.globalAlpha = busy ? 0.3 : 0.12; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    // spotlight pools under the machine
    px.glow(g, art.DRUM.cx, art.DRUM.cy + 40, 900, PAL.violet, 0.22);
    px.glow(g, art.DRUM.cx, art.DRUM.cy, 700, PAL.orange, busy ? 0.22 : 0.12);
    sprite(pedestal, art.PEDESTAL.cx - art.PEDESTAL.w / 2, art.PEDESTAL.top, art.PEDESTAL.w);
    // drum back
    const gb = drumL.begin(); art.drumBack(gb); drumL.blit(g);
    // balls
    const spot = board.spot();
    for (const b of drum.balls) {
      b.flash = Math.max(0, (b.flash || 0) - dt);
      if (b.big) px.glow(g, b.x, b.y, b.r * 4, PAL.gold, 0.4);
      art.drawBall(g, b, b.x, b.y, { ring: b === spot && mode === "idle" ? PAL.gold : b.flash > 0 ? PAL.bone : null });
    }
    // tube with the riding ball inside
    tube.back.blit(g);
    const bp = ballPos(now);
    if (bp && roll && roll.phase !== "settle" && roll.phase !== "win") {
      px.glow(g, bp.x, bp.y, 200, PAL.orange, 0.6);
      art.drawBall(g, roll.ball, bp.x, bp.y);
    }
    tube.front.blit(g);
    // drum front
    const sucking = roll && roll.phase === "suck" && now - roll.t0 > T.decoy;
    const gf = frontL.begin(); art.drumFront(gf, drum.ang, vaneLines(drum), sucking ? 1 : 0); frontL.blit(g);
    if (sucking && Math.floor(now * 8) % 2) px.glow(g, art.MOUTH.x, art.MOUTH.y, 220, PAL.orange, 0.7);
    // pump: lamp on while sucking, shakes while the ball is inside
    const pumpOn = roll && ["suck", "tube", "pump", "drop"].includes(roll.phase) && now - roll.t0 > T.vacuum;
    const jig = roll?.phase === "pump" && !reduced() ? px.snap(rnd(-1, 1) * 6) : 0;
    const ph = sprite(pump, art.PUMP.x + jig, art.PUMP.y, art.PUMP.w);
    if (pumpOn && Math.floor(now * 6) % 2) px.glow(g, art.PUMP.x + art.PUMP.w * 0.5 + jig, art.PUMP.y + ph * 0.09, 220, PAL.orange, 0.85);
    // holder and the ball in it
    sprite(holder, art.HOLDER.cx - art.HOLDER.w / 2, art.HOLDER.top, art.HOLDER.w);
    if (bp && roll && roll.phase === "settle") {
      px.glow(g, bp.x, bp.y, 260, PAL.gold, 0.6 + 0.3 * Math.sin(now * 12));
      art.drawBall(g, roll.ball, bp.x, bp.y);
    }
    // title
    px.text(g, "ЛОТО ЗАБАВА", 300, 64, { size: 58, color: PAL.gold, align: "center", depth: 5, drop: PAL.rust, ls: 4 });
    if (roll?.info) px.text(g, `РАУНД ${roll.info.round} ${tr("З", "ИЗ")} ${roll.info.totalRounds}`, 300, 122, { size: 26, color: PAL.amber, align: "center", depth: 3 });
    board.draw(g, now, { mode, pool: pool(), roll });
  }

  // ---------------------------------------------------------------- frame
  let raf = 0, last = performance.now() / 1000, destroyed = false;
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000, dt = Math.min(0.05, now - last);
    last = now;
    if (roll && mode !== "idle") updateRoll(now, dt);
    else { drum.omega = lerp(drum.omega, 0.35, dt); drum.air = lerp(drum.air, 0.1, dt); }
    drum.step(dt);
    if (drum.bumps && now - bumpAt > 0.07 && mode === "roll" && roll?.phase === "mix") { bumpAt = now; snd("tick"); }
    // idle: let everybody have a ball for a moment
    if (mode === "idle" && now > nextSwapAt) {
      nextSwapAt = now + 2.2;
      const inDrum = new Set(drum.balls.map((b) => b.p.id)), rest = pool().filter((p) => !inDrum.has(p.id));
      const cand = drum.balls.filter((b) => b !== board.spot());
      if (rest.length && cand.length) dress(cand[(Math.random() * cand.length) | 0], sampleWeighted(rest, 1)[0]);
    }
    board.tick(now, drum.balls, mode);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = PAL.ink; g.fillRect(0, 0, CW, CH);
    g.setTransform(S, 0, 0, S, OX, OY);
    g.imageSmoothingEnabled = false;
    if (shake > 0) { shake = Math.max(0, shake - dt * 2.2); g.translate(px.snap(rnd(-1, 1) * 12 * shake), px.snap(rnd(-1, 1) * 12 * shake)); }
    drawScene(now, dt);
    if (mode === "win") finale.draw(g, now, dt);
    drawParticles(dt);
    if (mode === "win" && finale.ambient(now) && !reduced()) burst(rnd(300, W - 300), rnd(160, 460), 60, 0.45);
    if (flash > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = PAL.amber; g.globalAlpha = (Math.round(flash * 4) / 4) * 0.7; g.fillRect(0, 0, CW, CH); g.globalAlpha = 1;
      flash = Math.max(0, flash - dt * 2.8);
    }
  }

  const onResize = () => fit();
  addEventListener("resize", onResize);
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  ro?.observe(root);
  root.dataset.phase = "idle";
  fit();
  raf = requestAnimationFrame(frame);

  return {
    setParticipants(list) {
      participants = list.slice();
      numOf.clear();
      participants.forEach((p, i) => numOf.set(p.id, i + 1));
      localWon.clear();
      if (mode === "idle") rebuildBalls();
      root.dataset.pool = String(pool().length);
    },
    setPrize(prize) { board.setPrize(prize); },
    roll(winner, info) {
      return new Promise((resolve) => {
        if (!numOf.has(winner.id)) numOf.set(winner.id, participants.length + 1);
        if (!drum.balls.length) rebuildBalls();
        startRoll(winner, info, () => { localWon.add(winner.id); root.dataset.phase = "done"; resolve(); });
        last = performance.now() / 1000;
      });
    },
    reset() {
      if (roll && !roll.done) { roll.done = true; try { roll.resolve?.(); } catch { /* ignore */ } }
      mode = "idle"; roll = null; drum.pull = null; particles = []; flash = 0; shake = 0;
      board.say("");
      delete root.dataset.shownWinner;
      root.dataset.phase = "idle";
      rebuildBalls();
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      removeEventListener("resize", onResize); ro?.disconnect(); canvas.remove();
    },
  };
}
