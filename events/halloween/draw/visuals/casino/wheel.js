// The European wheel of «Рулетка»: 37 pockets in the casino order, painted once into a small canvas and
// turned nearest-neighbour so it stays pixel art. A spin is planned up front: the wheel and the ball run
// on easing curves chosen so that the ball drops into the pocket of the number the server's winner sits on.

export const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const colorOf = (n) => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");
export const FILL = { red: "#b3202a", black: "#1a1420", green: "#1f7a3a" };
const DARK = { red: "#6e1219", black: "#0c0a10", green: "#0f4220" };

const SEC = (Math.PI * 2) / 37;
const IDLE_W = 0.3; // rad/s
const TAU = Math.PI * 2;
/** Angle of a pocket on the wheel, 0 = up. */
export const pocketAngle = (n) => -Math.PI / 2 + ORDER.indexOf(n) * SEC;

// design-pixel geometry, matched to the bowl sprite (wheel-bowl.webp)
export const WH = { cx: 450, cy: 590, bowl: 420, rim: 218, num: 197, pOut: 178, pIn: 142, track: 258, pocket: 160, ballR: 9 };

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function makeWheel({ px }) {
  const { PAL } = px;
  const P = 2; // art pixel of the wheel disc (finer than the scene's 4 so the numbers stay legible)
  const disc = paintDisc();
  let ang = Math.random() * TAU;
  const ball = { num: ORDER[(Math.random() * 37) | 0], w: 0, r: WH.pocket, hop: 0 };
  let plan = null;

  function paintDisc() {
    const D = (WH.rim * 2) / P, c = px.canvas(D, D), g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.setTransform(1 / P, 0, 0, 1 / P, D / 2, D / 2);
    const ring = (r0, r1, a0, a1, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill(); };
    ring(WH.pIn - 6, WH.rim, 0, TAU, "#2a170c");
    ORDER.forEach((n, i) => {
      const a = -Math.PI / 2 + i * SEC, a0 = a - SEC / 2, a1 = a + SEC / 2, k = colorOf(n);
      ring(WH.pOut + 4, WH.rim - 6, a0, a1, FILL[k]);
      ring(WH.pIn, WH.pOut, a0, a1, DARK[k]);
      // gold frets
      g.strokeStyle = PAL.gold; g.lineWidth = 3;
      g.beginPath(); g.moveTo(Math.cos(a0) * WH.pIn, Math.sin(a0) * WH.pIn); g.lineTo(Math.cos(a0) * (WH.rim - 6), Math.sin(a0) * (WH.rim - 6)); g.stroke();
      // the number, radial, top towards the rim
      g.save(); g.rotate(a + Math.PI / 2); g.translate(0, -WH.num);
      g.font = px.font(22); g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = PAL.bone; g.fillText(String(n), 0, 2);
      g.restore();
    });
    g.strokeStyle = PAL.gold; g.lineWidth = 4;
    for (const r of [WH.pIn, WH.pOut + 2, WH.rim - 6]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    // the cone and the turret
    const cone = ["#3a2010", "#4a2a14", "#5e3618", "#6e4220"];
    cone.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, WH.pIn - 4 - i * 28, 0, TAU); g.fill(); });
    g.fillStyle = PAL.gold;
    for (let k = 0; k < 4; k++) { g.save(); g.rotate((k * Math.PI) / 2); g.fillRect(-5, -62, 10, 52); g.beginPath(); g.arc(0, -64, 10, 0, TAU); g.fill(); g.restore(); }
    g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill();
    g.fillStyle = PAL.amber; g.beginPath(); g.arc(-6, -6, 10, 0, TAU); g.fill();
    return c;
  }

  const ease2 = (u) => 1 - Math.pow(1 - clamp(u), 2);
  const ease3 = (u) => 1 - Math.pow(1 - clamp(u), 3);
  const hermite = (u, p0, m0, p1) => { u = clamp(u); const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1; };

  const TB = 5.2, TS = 1.9, TW = TB + 3;

  return {
    TIME: TB + TS,
    /** Start a spin that ends with the ball in pocket `num`. */
    launch(now, num) {
      const A = TAU * (1.2 + Math.random() * 0.3);
      const angTB = ang + IDLE_W * TB + A * ease2(TB / TW);
      const phiF = pocketAngle(num), phiD = phiF + SEC * (3 + Math.random() * 3);
      const b0 = ang + pocketAngle(ball.num);
      let B = b0 - (phiD + angTB);
      while (B < TAU * 4.6) B += TAU;
      while (B > TAU * 5.6) B -= TAU;
      // relative speed of the ball at the drop: the ball stops in the world, the wheel still turns under it
      const relV = -(IDLE_W + (A * 2 * (1 - TB / TW)) / TW);
      plan = { t0: now, ang0: ang, A, b0, B, phiD, phiF, relV, num, hops: 0 };
      ball.num = num;
    },
    /** Advances the wheel; returns "hop" when the ball lands on a fret (for a tick), "done" once it rests. */
    update(now, dt) {
      if (!plan) { ang += IDLE_W * dt; ball.w = ang + pocketAngle(ball.num); ball.r = WH.pocket; ball.hop = 0; return null; }
      const p = plan, t = now - p.t0;
      ang = p.ang0 + IDLE_W * t + p.A * ease2(t / TW);
      if (t < TB) {
        const u = t / TB;
        ball.w = p.b0 - p.B * ease3(u);
        const fall = clamp((u - 0.8) / 0.2);
        ball.r = WH.track - (WH.track - WH.pOut - 18) * fall * fall + (fall > 0.55 && fall < 0.75 ? -10 : 0);
        ball.hop = 0;
        return null;
      }
      const s = (t - TB) / TS;
      ball.w = ang + hermite(s, p.phiD, p.relV * TS, p.phiF);
      const hops = 4, k = Math.min(hops - 1, Math.floor(s * hops * 1.2));
      const h = Math.abs(Math.sin(s * hops * 1.2 * Math.PI)) * 34 * Math.exp(-s * 3.2) * (s < 0.83 ? 1 : 0);
      ball.r = WH.pocket + h; ball.hop = h;
      let ev = null;
      if (k > p.hops) { p.hops = k; ev = "hop"; }
      if (s >= 1) { plan = null; ev = "done"; }
      return ev;
    },
    get spinning() { return !!plan; },
    draw(g) {
      const { cx, cy } = WH;
      g.save(); g.translate(cx, cy); g.rotate(Math.round(ang / (SEC / 6)) * (SEC / 6));
      const s = g.imageSmoothingEnabled; g.imageSmoothingEnabled = false;
      g.drawImage(disc, -WH.rim, -WH.rim, WH.rim * 2, WH.rim * 2);
      g.imageSmoothingEnabled = s;
      g.restore();
    },
    drawBall(g) {
      const x = WH.cx + Math.cos(ball.w) * ball.r, y = WH.cy + Math.sin(ball.w) * ball.r, r = WH.ballR + ball.hop * 0.08;
      g.fillStyle = "rgba(0,0,0,.45)"; px.disc(g, x + 4, y + 6, r, "rgba(0,0,0,.45)");
      px.disc(g, x, y, r + 4, PAL.ink);
      px.disc(g, x, y, r, PAL.bone);
      px.ember(g, x - 4, y - 4, 4, "#ffffff");
      return { x, y };
    },
  };
}
