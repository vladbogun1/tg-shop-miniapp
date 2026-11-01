// The betting table of «Рулетка»: the European layout (0 + 3 rows × 12), every participant is one chip on
// one number, the chips of a number make a stack (its top chip is the one with the most tickets). Numbers are
// dealt out evenly, so with 2000 people every number carries ~54 chips; a spin only has to pick a number,
// the second stage picks the person on it.
import { colorOf, FILL } from "./wheel.js";

export const TB = { x: 924, y: 300, zw: 84, cw: 72, ch: 120 };
TB.w = TB.zw + 12 * TB.cw; TB.h = 3 * TB.ch;
export const CHIP_R = 25;
const CHIP_COLS = ["#ff6600", "#8a3ffc", "#7cff4f", "#ffd36b", "#e0303e", "#3fb6ff", "#f4f1ea"];

export function cellRect(n) {
  if (n === 0) return { x: TB.x, y: TB.y, w: TB.zw, h: TB.h };
  const col = Math.ceil(n / 3) - 1, row = 2 - ((n - 1) % 3);
  return { x: TB.x + TB.zw + col * TB.cw, y: TB.y + row * TB.ch, w: TB.cw, h: TB.ch };
}
/** Where the stack of a number stands. */
export function stackAt(n) { const r = cellRect(n); return { x: r.x + r.w / 2, y: r.y + r.h - 36 }; }

export function hash(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const PERM = Array.from({ length: 37 }, (_, n) => n).sort((a, b) => hash(`n${a}`) - hash(`n${b}`));

/** id → number for the whole list (won ones included, so the seats stay put through the rounds). */
export function seat(list) {
  const ids = list.map((p) => p.id).sort((a, b) => hash(a) - hash(b) || (String(a) < String(b) ? -1 : 1));
  const m = new Map();
  ids.forEach((id, i) => m.set(id, PERM[i % 37]));
  return m;
}
export const chipColor = (p) => CHIP_COLS[hash(`c${p.id}`) % CHIP_COLS.length];

export function makeTable({ px, avatarOf }) {
  const { PAL } = px;
  const felt = paintFelt();
  const sprites = new Map();

  function paintFelt() {
    const m = 40, c = px.canvas(TB.w + 2 * m, TB.h + 2 * m), g = c.getContext("2d");
    g.translate(m - TB.x, m - TB.y);
    // wooden rail and the felt
    g.fillStyle = "#3a1d0c"; g.fillRect(TB.x - 32, TB.y - 32, TB.w + 64, TB.h + 64);
    g.fillStyle = "#5a2e12"; g.fillRect(TB.x - 24, TB.y - 24, TB.w + 48, TB.h + 48);
    g.fillStyle = PAL.gold; g.fillRect(TB.x - 12, TB.y - 12, TB.w + 24, 4); g.fillRect(TB.x - 12, TB.y + TB.h + 8, TB.w + 24, 4);
    g.fillRect(TB.x - 12, TB.y - 12, 4, TB.h + 24); g.fillRect(TB.x + TB.w + 8, TB.y - 12, 4, TB.h + 24);
    g.fillStyle = "#123a24"; g.fillRect(TB.x - 8, TB.y - 8, TB.w + 16, TB.h + 16);
    // dither of the felt
    g.fillStyle = "#0f3220";
    for (let y = TB.y - 8; y < TB.y + TB.h + 8; y += 8) for (let x = TB.x - 8 + ((y / 8) % 2) * 4; x < TB.x + TB.w + 8; x += 8) g.fillRect(x, y, 4, 4);
    for (let n = 0; n <= 36; n++) {
      const r = cellRect(n), k = colorOf(n);
      g.fillStyle = PAL.bone; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = "#123a24"; g.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      // the number on a little colour tile
      const tw = n === 0 ? 52 : 44;
      g.fillStyle = PAL.ink; g.fillRect(r.x + r.w / 2 - tw / 2 - 4, r.y + 10, tw + 8, 36);
      g.fillStyle = FILL[k]; g.fillRect(r.x + r.w / 2 - tw / 2, r.y + 14, tw, 28);
      px.text(g, String(n), r.x + r.w / 2, r.y + 29, { size: 26, color: PAL.bone, align: "center", depth: 2 });
    }
    return { c, x: TB.x - m, y: TB.y - m };
  }

  function chipSprite(col, r) {
    const key = col + r;
    let c = sprites.get(key);
    if (c) return c;
    const s = r * 2 + 8;
    c = px.canvas(s, s);
    const g = c.getContext("2d"), o = s / 2;
    px.disc(g, o, o, r + 4, PAL.ink, 2);
    px.disc(g, o, o, r, col, 2);
    // the white edge notches of a casino chip
    g.fillStyle = PAL.bone;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, x = o + Math.cos(a) * (r - 4), y = o + Math.sin(a) * (r - 4);
      g.fillRect(Math.round(x / 2) * 2 - 3, Math.round(y / 2) * 2 - 3, 6, 6);
    }
    px.disc(g, o, o, r * 0.68 + 2, "rgba(0,0,0,.35)", 2);
    px.circle(g, o, o, r * 0.68 + 2, "rgba(255,255,255,.35)", 1, 2);
    sprites.set(key, c);
    return c;
  }

  /** One chip: colour by person, their avatar (or initial) in the middle. */
  function chip(g, p, x, y, r = CHIP_R, o = {}) {
    const col = chipColor(p), spr = chipSprite(col, r);
    g.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
    if (o.face === false) return;
    const ir = Math.round(r * 0.62), av = avatarOf(p);
    if (av) {
      g.save(); g.beginPath(); g.arc(x, y, ir, 0, Math.PI * 2); g.clip();
      px.photo(g, av, x - ir, y - ir, ir * 2);
      g.restore();
    } else {
      const ch = [...(p.name || "?").trim()][0]?.toUpperCase() || "?";
      px.text(g, ch, x, y + 1, { size: Math.round(r * 0.9), color: PAL.bone, align: "center", depth: 2 });
    }
  }

  /**
   * cells: Map n → { people (most tickets first), at (when the stack lands) };
   * o: { now, spot, hit (the rolled number), sweep (rake x or null), hideHit }
   */
  function draw(g, cells, o) {
    g.drawImage(felt.c, felt.x, felt.y);
    if (o.spot != null) { const r = cellRect(o.spot); px.ring(g, r.x + 4, r.y + 4, r.w - 8, r.h - 8, PAL.gold); }
    if (o.hit != null) {
      const r = cellRect(o.hit);
      px.glow(g, r.x + r.w / 2, r.y + r.h / 2, 260, PAL.gold, 0.55 + 0.25 * Math.sin(o.now * 10));
      px.ring(g, r.x + 4, r.y + 4, r.w - 8, r.h - 8, Math.floor(o.now * 6) % 2 ? PAL.gold : PAL.bone);
    }
    for (const [n, cell] of cells) {
      if (!cell.people.length) continue;
      if (n === o.hit && o.hideHit) continue;
      const base = stackAt(n);
      let x = base.x, y = base.y, alpha = 1;
      // landing: drop from above with one bounce
      const u = (o.now - cell.at) / 0.45;
      if (u < 0) continue;
      if (u < 1) y -= (1 - u) * (1 - u) * 120 - Math.sin(u * Math.PI) * 6;
      // the rake pushes the losing stacks off the table
      if (o.sweep != null && n !== o.hit) {
        const d = o.sweep - (x - 30);
        if (d > 0) { x += d; y += (TB.y + TB.h / 2 - y) * Math.min(1, d / 200); alpha = Math.max(0, 1 - d / 260); }
      }
      if (alpha <= 0) continue;
      g.globalAlpha = alpha;
      const k = Math.min(5, cell.people.length);
      for (let i = 0; i < k - 1; i++) chip(g, cell.people[k - 1 - i], x, y - i * 4, CHIP_R, { face: false });
      chip(g, cell.people[0], x, y - (k - 1) * 4, CHIP_R);
      if (cell.people.length > 1) {
        const t = String(cell.people.length), w = Math.max(28, px.measure(g, t, 18) + 12);
        g.fillStyle = PAL.ink; g.fillRect(Math.round(x + 14 - w / 2), Math.round(y + 8), Math.round(w), 22);
        px.text(g, t, x + 14, y + 20, { size: 18, color: PAL.gold, align: "center", depth: 2 });
      }
      g.globalAlpha = 1;
    }
  }

  return { draw, chip };
}
