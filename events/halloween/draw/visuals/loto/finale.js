// The winner screen of «Лото Забава»: the ball flies out of the cup to the centre and grows, its number
// disc turns into the avatar (or the number), rays behind, the name huge, the prize on the right.
import { t } from "../../lang.js";

export function makeFinale({ px, art, W, H, host, reduced }) {
  const { PAL } = px;
  const rays = px.lowres(W, H);
  const BIG = 150, CY = 360;
  let s = null;

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
  const easeOutBack = (t) => { t = clamp(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const stepped = (t, n = 6) => Math.round(clamp(t) * n) / n;

  function drawRays(g, now, color, ramp) {
    const bg = rays.begin(), rot = Math.round(now * (reduced() ? 0.08 : 0.16) * 24) / 24;
    bg.save(); bg.translate(W / 2, CY); bg.rotate(rot);
    bg.fillStyle = color; bg.globalAlpha = 0.16 * ramp;
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      bg.beginPath(); bg.moveTo(0, 0); bg.arc(0, 0, 1300, a0, a0 + Math.PI / 16 * 0.8); bg.closePath(); bg.fill();
    }
    bg.restore();
    rays.blit(g);
  }

  return {
    start(now, winner, ball, from, info, pic, avatar) { s = { t0: now, winner, ball, from, info, pic, avatar, nextBurst: now + 1.4 }; },
    /** true about every 2.6 s after the reveal: time for an ambient burst. */
    ambient(now) { if (!s || now < s.nextBurst) return false; s.nextBurst = now + 2.6; return true; },
    draw(g, now) {
      if (!s) return;
      const u = now - s.t0, ramp = stepped(u / 0.8, 6), col = art.TIERS[s.ball.tier].c;
      g.fillStyle = PAL.ink; g.globalAlpha = 0.76 * ramp; g.fillRect(-400, -400, W + 800, H + 800); g.globalAlpha = 1;
      drawRays(g, now, col, ramp);
      px.glow(g, W / 2, CY, 1000, col, 0.5 * ramp);
      px.glow(g, W / 2, CY, 600, PAL.orange, 0.45 * ramp);
      // the mascot presents the winner
      if (px.ready(host) && u > 0.5) {
        const a = stepped((u - 0.5) / 0.6, 5), w = 380, h = (w * host.naturalHeight) / host.naturalWidth;
        g.globalAlpha = a;
        g.drawImage(host, px.snap(W / 2 - 680 - w / 2 - (1 - a) * 120), px.snap(700 - h + (Math.floor(now * 3) % 2 ? -8 : 0)), w, h);
        g.globalAlpha = 1;
      }
      // the ball flies to the centre and grows
      const f = easeOutCubic(u / 0.9), k = easeOutBack(u / 0.9);
      const x = s.from.x + (W / 2 - s.from.x) * f, y = s.from.y + (CY - s.from.y) * f;
      const sc = 1 + (BIG / s.ball.r - 1) * k;
      const b = { ...s.ball, spin: u < 0.9 ? s.ball.spin + u * 12 : Math.PI / 2 * 3 + 0.0001 };
      art.drawBall(g, b, x, y + (Math.floor(now * 2) % 2 ? -4 : 0) * f, { scale: sc, avatar: u > 0.9 ? s.avatar : null });
      // texts
      const pop = (d) => stepped(easeOutBack((u - d) / 0.55), 8);
      const at = (sc2, yy, fn, xx = W / 2) => { if (sc2 <= 0.01) return; g.save(); g.translate(xx, yy); g.scale(sc2, sc2); g.globalAlpha = Math.min(1, sc2); fn(); g.restore(); };
      at(pop(0.45), 86, () => px.text(g, t("ПЕРЕМОЖЕЦЬ", "ПОБЕДИТЕЛЬ"), 0, 0, { size: 80, color: PAL.gold, align: "center", ls: 6, depth: 5, drop: PAL.rust }));
      if (s.pic && px.ready(s.pic.img)) {
        const [pw, ph] = px.prizePictureSize(s.pic, 360);
        at(pop(0.9), CY, () => {
          px.prizeFrame(g, s.pic, -pw / 2, -ph / 2, pw, ph);
          const pn = px.prizeLabel(s.info?.prize?.name);
          if (pn) px.text(g, pn, 0, ph / 2 + 52, { size: clamp(px.fit(g, pn, 34, 420), 20, 34), color: PAL.gold, align: "center", depth: 3 });
        }, W / 2 + 640);
      }
      const nm = s.winner.name || "?";
      at(pop(0.75), 660, () => px.text(g, nm, 0, 0, { size: clamp(px.fit(g, nm, 160, 1560), 64, 160), color: PAL.bone, align: "center", depth: 8, drop: PAL.rust }));
      if (s.winner.handle) at(pop(1.0), 770, () => px.text(g, s.winner.handle, 0, 0, { size: clamp(px.fit(g, s.winner.handle, 72, 1200), 40, 72), color: PAL.slime, align: "center", depth: 5, drop: PAL.moss }));
      const tt = s.winner.tickets, info = `${t("КУЛЬКА", "ШАР")} №${s.ball.num}  ·  ${tt} ${px.ticketsWord(tt)}`;
      at(pop(1.25), 880, () => {
        const iw = px.snap(px.measure(g, info, 30) + 56);
        px.box(g, -iw / 2, -28, iw, 56, { frame: col });
        px.text(g, info, 0, 2, { size: 30, color: PAL.bone, align: "center", depth: 3 });
      });
      g.globalAlpha = 1;
    },
  };
}
