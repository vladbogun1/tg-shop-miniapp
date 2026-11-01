// The winner screen of «Рулетка»: the winner's chip flies to the centre and grows, rays behind it,
// the name huge, the rolled number and the prize.
import { t } from "../../lang.js";
import { colorOf, FILL } from "./wheel.js";

export function makeFinale({ px, table, W, H, reduced }) {
  const { PAL } = px;
  const rays = px.lowres(W, H);
  const BIG = 150, CY = 360;
  let s = null;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOutCubic = (u) => 1 - Math.pow(1 - clamp(u), 3);
  const easeOutBack = (u) => { u = clamp(u); const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  const stepped = (u, n = 6) => Math.round(clamp(u) * n) / n;

  function drawRays(g, now, color, ramp) {
    const bg = rays.begin(), rot = Math.round(now * (reduced() ? 0.08 : 0.16) * 24) / 24;
    bg.save(); bg.translate(W / 2, CY); bg.rotate(rot);
    bg.fillStyle = color; bg.globalAlpha = 0.16 * ramp;
    for (let i = 0; i < 18; i++) {
      const a0 = (i / 18) * Math.PI * 2;
      bg.beginPath(); bg.moveTo(0, 0); bg.arc(0, 0, 1300, a0, a0 + (Math.PI / 18) * 0.8); bg.closePath(); bg.fill();
    }
    bg.restore();
    rays.blit(g);
  }

  return {
    start(now, winner, num, from, info, pic) { s = { t0: now, winner, num, from, info, pic, nextBurst: now + 1.4 }; },
    /** true about every 2.6 s after the reveal: time for an ambient burst. */
    ambient(now) { if (!s || now < s.nextBurst) return false; s.nextBurst = now + 2.6; return true; },
    draw(g, now) {
      if (!s) return;
      const u = now - s.t0, ramp = stepped(u / 0.8, 6), col = FILL[colorOf(s.num)];
      g.fillStyle = PAL.ink; g.globalAlpha = 0.78 * ramp; g.fillRect(-400, -400, W + 800, H + 800); g.globalAlpha = 1;
      drawRays(g, now, PAL.gold, ramp);
      px.glow(g, W / 2, CY, 1000, col, 0.5 * ramp);
      px.glow(g, W / 2, CY, 600, PAL.orange, 0.45 * ramp);
      // the chip flies to the centre and grows (radius in steps, so the chip sprites stay few)
      const f = easeOutCubic(u / 0.9), k = easeOutBack(u / 0.9);
      const x = s.from.x + (W / 2 - s.from.x) * f, y = s.from.y + (CY - s.from.y) * f;
      const r = Math.max(10, Math.round((s.from.r + (BIG - s.from.r) * k) / 10) * 10);
      table.chip(g, s.winner, x, y + (Math.floor(now * 2) % 2 ? -4 : 0) * f, r);
      const pop = (d) => stepped(easeOutBack((u - d) / 0.55), 8);
      const at = (sc, yy, fn, xx = W / 2) => { if (sc <= 0.01) return; g.save(); g.translate(xx, yy); g.scale(sc, sc); g.globalAlpha = Math.min(1, sc); fn(); g.restore(); };
      at(pop(0.45), 86, () => px.text(g, t("ПЕРЕМОЖЕЦЬ", "ПОБЕДИТЕЛЬ"), 0, 0, { size: 80, color: PAL.gold, align: "center", ls: 6, depth: 5, drop: PAL.rust }));
      at(pop(0.9), CY, () => px.prizeBlock(g, s.pic, s.info?.prize?.name), W / 2 + 640);
      // the rolled number as a big table tile on the left
      at(pop(0.6), CY, () => {
        px.box(g, -90, -90, 180, 180, { frame: PAL.gold, fill: col });
        px.text(g, String(s.num), 0, 4, { size: 110, color: PAL.bone, align: "center", depth: 6 });
      }, W / 2 - 640);
      const nm = s.winner.name || "?";
      at(pop(0.75), 660, () => px.text(g, nm, 0, 0, { size: clamp(px.fit(g, nm, 160, 1560), 64, 160), color: PAL.bone, align: "center", depth: 8, drop: PAL.rust }));
      if (s.winner.handle) at(pop(1.0), 770, () => px.text(g, s.winner.handle, 0, 0, { size: clamp(px.fit(g, s.winner.handle, 72, 1200), 40, 72), color: PAL.slime, align: "center", depth: 5, drop: PAL.moss }));
      const tt = s.winner.tickets, info = `${t("ЧИСЛО", "ЧИСЛО")} ${s.num}  ·  ${tt} ${px.ticketsWord(tt)}`;
      at(pop(1.25), 880, () => {
        const iw = px.snap(px.measure(g, info, 30) + 56);
        px.box(g, -iw / 2, -28, iw, 56, { frame: PAL.gold });
        px.text(g, info, 0, 2, { size: 30, color: PAL.bone, align: "center", depth: 3 });
      });
      g.globalAlpha = 1;
    },
  };
}
