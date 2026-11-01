// Visual "casino": «Рулетка», a European roulette in a gothic casino hall, in the 16-bit look of the OBS overlays.
// Idle: the wheel turns slowly; every participant is a chip standing on one number of the table (numbers are
// dealt out evenly, ~54 chips a number at 2000 people); the panel walks over the numbers and lists who is on each.
// Roll: «no more bets», the ball runs the track and drops into the number of the server's winner; the skeleton
// croupier's rake sweeps every other number off the table; the chips of the rolled number spill into a grid and
// a light hops over them, slowing down, onto the winner. A number with one chip goes straight to the finale.
import * as px from "../pixel-kit.js";
import { t as tr } from "../../lang.js";
import { makeWheel, WH, colorOf } from "./wheel.js";
import { makeTable, seat, hash, TB, stackAt, CHIP_R } from "./table.js";
import { makePick } from "./pick.js";
import { makePanel } from "./panel.js";
import { makeFinale } from "./finale.js";

export const meta = { id: "casino", title: "Рулетка", author: "agent" };

const W = 1920, H = 1080;
const { PAL } = px;
const T = { hit: 1.0, rake: 1.3 };
const SPOT_S = 1.8;

const rnd = (a, b) => a + Math.random() * (b - a);

export function mount(root, ctx) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated";
  root.append(canvas);
  const g = canvas.getContext("2d", { alpha: false });
  const reduced = () => !!ctx.reducedMotion;
  const avatarsOn = () => ctx.privacy?.avatars !== false;
  const snd = (n) => { try { ctx.sound?.(n); } catch { /* sound must never break the show */ } };

  const hall = px.loadImage(px.sceneUrl("casino-hall"));
  const bowl = px.loadImage(px.spriteUrl("casino-bowl"));
  const rake = px.loadImage(px.spriteUrl("casino-rake"));
  px.ensureFont();

  let S = 1, OX = 0, OY = 0, CW = 1920, CH = 1080;
  function fit() {
    const w = root.clientWidth || ctx.size?.w || innerWidth, h = root.clientHeight || ctx.size?.h || innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    CW = Math.round(w * dpr); CH = Math.round(h * dpr);
    canvas.width = CW; canvas.height = CH;
    S = Math.min(CW / W, CH / H); OX = (CW - W * S) / 2; OY = (CH - H * S) / 2;
  }

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

  const wheel = makeWheel({ px });
  const table = makeTable({ px, avatarOf });
  const pick = makePick({ px, table });
  const panel = makePanel({ px, table });
  const finale = makeFinale({ px, table, W, H, reduced });

  // ---------------------------------------------------------------- participants → chips on numbers
  let participants = [];
  let seats = new Map();
  const localWon = new Set();
  const landed = new Map(); // number → when its stack landed (kept across updates of the list)
  let cells = new Map();
  const pool = () => participants.filter((p) => !p.won && !localWon.has(p.id));
  const numOf = (p) => seats.get(p.id) ?? hash(p.id) % 37;

  function rebuildCells(now = performance.now() / 1000) {
    const m = new Map();
    for (const p of pool()) {
      const n = numOf(p);
      if (!m.has(n)) m.set(n, []);
      m.get(n).push(p);
    }
    cells = new Map();
    let order = 0;
    for (const [n, people] of [...m].sort((a, b) => a[0] - b[0])) {
      people.sort((a, b) => b.tickets - a.tickets || String(a.name).localeCompare(String(b.name)));
      if (!landed.has(n)) landed.set(n, now + 0.2 + order++ * 0.05);
      cells.set(n, { people, at: landed.get(n) });
    }
  }

  // ---------------------------------------------------------------- state
  let mode = "idle"; // idle | roll | win
  let roll = null;
  let particles = [];
  let flash = 0, shake = 0, spot = null, spotAt = 0;

  function startRoll(winner, info, resolve) {
    const now = performance.now() / 1000;
    localWon.delete(winner.id);
    if (!participants.some((p) => p.id === winner.id)) participants.push(winner);
    rebuildCells(now);
    const num = numOf(winner);
    const people = cells.get(num)?.people ?? [winner];
    if (!people.some((p) => p.id === winner.id)) people.unshift(winner);
    roll = { winner, info, num, people, t0: now, phase: "spin", pic: px.prizePicture(info?.prize), resolve };
    mode = "roll"; particles = []; flash = 0; shake = 0;
    wheel.launch(now, num);
    snd("whoosh");
    panel.say(tr("СТАВОК БІЛЬШЕ НЕМАЄ", "СТАВОК БОЛЬШЕ НЕТ"));
    root.dataset.phase = "roll"; root.dataset.shownWinner = winner.id;
  }

  const colorWord = (n) => ({ red: tr("ЧЕРВОНЕ", "КРАСНОЕ"), black: tr("ЧОРНЕ", "ЧЁРНОЕ"), green: tr("ЗЕРО", "ЗЕРО") })[colorOf(n)];

  function updateRoll(now, ev) {
    const r = roll, u = now - (r.tp ?? r.t0);
    if (r.phase === "spin") {
      if (ev === "hop") snd("tick");
      if (ev === "done") {
        r.phase = "hit"; r.tp = now; snd("drum");
        panel.say(r.num === 0 ? tr("ЗЕРО!", "ЗЕРО!") : `${r.num} ${colorWord(r.num)}!`);
        const b = stackAt(r.num); burst(b.x, b.y, reduced() ? 30 : 80, 0.5);
      }
    } else if (r.phase === "hit" && u > T.hit) {
      r.phase = "rake"; r.tp = now; snd("whoosh");
      panel.say(tr("ЗАБИРАЄМО ФІШКИ", "ЗАБИРАЕМ ФИШКИ"));
    } else if (r.phase === "rake" && u > T.rake) {
      r.tp = now;
      if (r.people.length > 1) {
        r.phase = "pick"; pick.start(now, r.people, r.winner, r.num);
        panel.say(tr(`НА ${r.num} — ${r.people.length} ФІШОК`, `НА ${r.num} — ${r.people.length} ФИШЕК`));
      } else {
        panel.say(tr("ЄДИНА ФІШКА!", "ЕДИНСТВЕННАЯ ФИШКА!"));
        const b = stackAt(r.num); reveal(now, { x: b.x, y: b.y, r: CHIP_R });
      }
    } else if (r.phase === "pick") {
      const e = pick.update(now);
      if (e === "hop") snd("tick");
      if (e === "done") reveal(now, pick.winnerAt());
    }
  }

  function reveal(now, from) {
    const r = roll;
    mode = "win"; r.phase = "win";
    finale.start(now, r.winner, r.num, from, r.info, r.pic);
    pick.clear();
    burst(W / 2, 380, reduced() ? 160 : 340, 1);
    if (!reduced()) { flash = 1; shake = 1; }
    snd("boom"); setTimeout(() => snd("win"), 350);
    root.dataset.phase = "win";
    setTimeout(() => { if (roll === r && !r.done) { r.done = true; r.resolve?.(); } }, 2000);
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
  function rakeX(now) {
    if (!roll || roll.phase !== "rake") return roll && ["pick", "win"].includes(roll.phase) ? W + 400 : null;
    const u = (now - roll.tp) / T.rake;
    return TB.x - 60 + (TB.w + 500) * (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  }

  function drawScene(now) {
    const busy = mode !== "idle";
    px.cover(g, hall, 0, 0, W, H);
    g.fillStyle = PAL.ink; g.globalAlpha = busy ? 0.35 : 0.18; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    // the wheel
    px.glow(g, WH.cx, WH.cy, 1000, PAL.violet, 0.25);
    px.glow(g, WH.cx, WH.cy, 760, PAL.orange, busy ? 0.25 : 0.12);
    wheel.draw(g);
    if (px.ready(bowl)) { const s = WH.bowl * 2, h = (s * bowl.naturalHeight) / bowl.naturalWidth; g.drawImage(bowl, WH.cx - s / 2, WH.cy - h / 2, s, h); }
    const bp = wheel.drawBall(g);
    if (roll && roll.phase !== "spin") px.glow(g, bp.x, bp.y, 140, PAL.gold, 0.5 + 0.3 * Math.sin(now * 10));
    // the rolled number above the wheel
    if (roll && roll.phase !== "spin" && mode !== "win") {
      const k = Math.min(1, (now - (roll.hitAt ??= now)) / 0.25);
      g.save(); g.translate(WH.cx, 96); g.scale(k, k); panel.numTile(g, roll.num, -56, -56, 112); g.restore();
    }
    // the title
    px.text(g, tr("РУЛЕТКА", "РУЛЕТКА"), TB.x + TB.w / 2, 120, { size: 64, color: PAL.gold, align: "center", depth: 5, drop: PAL.rust, ls: 8 });
    if (roll?.info) px.text(g, `${tr("РАУНД", "РАУНД")} ${roll.info.round} ${tr("З", "ИЗ")} ${roll.info.totalRounds}`, TB.x + TB.w / 2, 186, { size: 26, color: PAL.amber, align: "center", depth: 3 });
    // the table
    const hit = roll && roll.phase !== "spin" ? roll.num : null;
    const sweep = rakeX(now);
    table.draw(g, cells, { now, spot: mode === "idle" ? spot : null, hit, sweep, hideHit: roll?.phase === "pick" || mode === "win" });
    if (sweep != null && sweep < W && px.ready(rake)) {
      const w = 640, h = (w * rake.naturalHeight) / rake.naturalWidth;
      g.drawImage(rake, Math.round(sweep - 20), Math.round(TB.y + TB.h / 2 - h / 2 + Math.sin(now * 20) * 4), w, h);
    }
    pick.draw(g, now);
    panel.draw(g, now, { mode, cells, spot, pool: pool(), roll });
  }

  // ---------------------------------------------------------------- frame
  let raf = 0, last = performance.now() / 1000, destroyed = false;
  function frame() {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const now = performance.now() / 1000, dt = Math.min(0.05, now - last);
    last = now;
    const ev = wheel.update(now, dt);
    if (roll && mode === "roll") updateRoll(now, ev);
    if (mode === "idle" && now > spotAt && cells.size) {
      spotAt = now + SPOT_S;
      const ns = [...cells.keys()];
      spot = ns[(ns.indexOf(spot) + 1) % ns.length];
    }

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.fillStyle = PAL.ink; g.fillRect(0, 0, CW, CH);
    g.setTransform(S, 0, 0, S, OX, OY);
    g.imageSmoothingEnabled = false;
    if (shake > 0) { shake = Math.max(0, shake - dt * 2.2); g.translate(px.snap(rnd(-1, 1) * 12 * shake), px.snap(rnd(-1, 1) * 12 * shake)); }
    drawScene(now);
    if (mode === "win") finale.draw(g, now);
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
      seats = seat(participants);
      localWon.clear();
      if (mode === "idle") rebuildCells();
      root.dataset.pool = String(pool().length);
    },
    setPrize(prize) { panel.setPrize(prize); },
    roll(winner, info) {
      return new Promise((resolve) => {
        startRoll(winner, info, () => { localWon.add(winner.id); root.dataset.phase = "done"; resolve(); });
        last = performance.now() / 1000;
      });
    },
    reset() {
      if (roll && !roll.done) { roll.done = true; try { roll.resolve?.(); } catch { /* ignore */ } }
      mode = "idle"; roll = null; particles = []; flash = 0; shake = 0;
      pick.clear(); panel.say("");
      landed.clear();
      delete root.dataset.shownWinner;
      root.dataset.phase = "idle";
      rebuildCells();
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      removeEventListener("resize", onResize); ro?.disconnect(); canvas.remove();
    },
  };
}
