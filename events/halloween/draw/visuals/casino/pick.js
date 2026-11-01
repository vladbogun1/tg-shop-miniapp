// The second stage of «Рулетка»: the chips of the rolled number spill out of their stack into a grid over
// the table, and a light hops from chip to chip, slowing down, until it stops on the server's winner.
import { t } from "../../lang.js";
import { stackAt } from "./table.js";

export const PA = { x: 892, y: 236, w: 1012, h: 470 };
const HOP0 = 0.9; // the hops start after the chips have spilled

export function makePick({ px, table }) {
  const { PAL } = px;
  let s = null;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (u) => 1 - Math.pow(1 - clamp(u), 3);

  function layout(n) {
    const ax = PA.x + 30, ay = PA.y + 84, aw = PA.w - 60, ah = PA.h - 160;
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * aw) / ah))), rows = Math.ceil(n / cols);
    const tile = Math.min(aw / cols, ah / rows), r = Math.round(Math.min(46, tile * 0.42));
    const gx = ax + (aw - cols * tile) / 2, gy = ay + (ah - rows * tile) / 2;
    return Array.from({ length: n }, (_, i) => ({ x: gx + ((i % cols) + 0.5) * tile, y: gy + (Math.floor(i / cols) + 0.5) * tile, r }));
  }

  function schedule(n, wi) {
    const H = Math.min(20, 8 + n), hops = [];
    let at = HOP0, prev = -1;
    for (let i = 0; i < H; i++) {
      let k = i === H - 1 ? wi : (Math.random() * n) | 0;
      if (i < H - 1 && n > 2) while (k === prev || (i === H - 2 && k === wi)) k = (Math.random() * n) | 0;
      hops.push({ at, k });
      prev = k;
      at += 0.06 + 0.42 * Math.pow((i + 1) / H, 2.4);
    }
    return { hops, end: at + 0.7 };
  }

  return {
    start(now, people, winner, num) {
      const wi = Math.max(0, people.findIndex((p) => p.id === winner.id));
      s = { t0: now, people, num, wi, pos: layout(people.length), ...schedule(people.length, wi), cur: -1, from: stackAt(num) };
    },
    /** "hop" on every jump of the light, "done" once it has rested on the winner. */
    update(now) {
      if (!s) return null;
      const u = now - s.t0;
      let i = s.cur;
      while (i + 1 < s.hops.length && u >= s.hops[i + 1].at) i++;
      if (i !== s.cur) { s.cur = i; return "hop"; }
      if (u >= s.end && !s.done) { s.done = true; return "done"; }
      return null;
    },
    /** Where the winner's chip is now (the finale starts from there). */
    winnerAt() { const p = s.pos[s.wi]; return { x: p.x, y: p.y, r: p.r }; },
    draw(g, now) {
      if (!s) return;
      const u = now - s.t0, n = s.people.length, lit = s.cur >= 0 ? s.hops[s.cur].k : -1;
      const open = ease(u / 0.35);
      g.globalAlpha = open;
      px.box(g, PA.x, PA.y, PA.w, PA.h, { frame: PAL.gold, fill: "rgba(14,14,16,.97)" });
      const head = `${t("ЧИСЛО", "ЧИСЛО")} ${s.num}  ·  ${n} ${t("ФІШОК", "ФИШЕК")}`;
      px.text(g, head, PA.x + PA.w / 2, PA.y + 44, { size: 38, color: PAL.gold, align: "center", depth: 4, drop: PAL.rust, ls: 3 });
      g.globalAlpha = 1;
      const stagger = Math.min(0.012, 0.35 / n);
      s.pos.forEach((p, i) => {
        const f = ease((u - 0.2 - i * stagger) / 0.45);
        if (f <= 0) return;
        const x = s.from.x + (p.x - s.from.x) * f, y = s.from.y + (p.y - s.from.y) * f - Math.sin(f * Math.PI) * 60;
        const on = i === lit, win = on && s.cur === s.hops.length - 1;
        if (on) px.glow(g, x, y, p.r * 6, win ? PAL.gold : PAL.orange, win ? 0.6 + 0.3 * Math.sin(now * 12) : 0.75);
        const r = on ? Math.round(p.r * 1.25) : p.r;
        if (lit >= 0 && !on) g.globalAlpha = 0.55;
        table.chip(g, s.people[i], x, y, r);
        g.globalAlpha = 1;
        if (on) px.circle(g, x, y, r + 8, win ? PAL.gold : PAL.bone, 1);
      });
      if (lit >= 0) {
        const nm = s.people[lit].name || "?";
        px.text(g, nm, PA.x + PA.w / 2, PA.y + PA.h - 40, { size: clamp(px.fit(g, nm, 48, PA.w - 80), 24, 48), color: PAL.bone, align: "center", depth: 4 });
      }
    },
    clear() { s = null; },
  };
}
