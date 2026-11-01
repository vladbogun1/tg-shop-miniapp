// The drum of «Лото Забава»: balls tumbling in a rotating glass drum with air blowing from below.
// Pure 2D circle physics in design pixels (1920×1080). It only has to look alive: who wins is decided by
// the server, and the suction (pull) drags that very ball to the tube mouth.

const G = 1500;          // gravity, px/s²
const AIR = 5600;        // upward push of the blower at air = 1
const SUB = 4;           // substeps per frame
const VANES = 4;

export function makeDrum({ cx, cy, r }) {
  const drum = {
    cx, cy, r,             // r — inner radius of the glass
    ang: 0, omega: 0.35,   // rotation, rad/s
    air: 0.1,              // 0..1 blower power
    vaneLen: 74,
    balls: [],
    pull: null,            // { ball, x, y, k, solid } — the suction
    bumps: 0,              // hard hits during the last step (for tick sounds)
  };

  drum.add = (ball) => {
    // drop it somewhere inside the lower half
    const a = Math.random() * Math.PI, d = Math.random() * (r - ball.r - 20);
    ball.x = cx + Math.cos(a) * d * 0.9;
    ball.y = cy + Math.sin(a) * d * 0.8;
    ball.vx = (Math.random() - 0.5) * 200; ball.vy = (Math.random() - 0.5) * 200;
    ball.spin = ball.spin ?? Math.random() * 7;
    drum.balls.push(ball);
    return ball;
  };
  drum.remove = (ball) => { drum.balls = drum.balls.filter((b) => b !== ball); };

  drum.step = (dt) => {
    drum.bumps = 0;
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) sub(h);
  };

  function sub(h) {
    drum.ang += drum.omega * h;
    const { balls } = drum;
    const pull = drum.pull;
    for (const b of balls) {
      let ax = 0, ay = G;
      // the blower: the lower the ball, the stronger and the more chaotic the push
      const low = (b.y - drum.cy) / drum.r;
      if (drum.air > 0 && low > -0.2) {
        const k = drum.air * (0.35 + Math.max(0, low)) * (0.4 + Math.random() * 1.2);
        ay -= AIR * k;
        ax += (Math.random() - 0.5) * AIR * 0.9 * drum.air;
      }
      if (pull && pull.ball === b) {
        const dx = pull.x - b.x, dy = pull.y - b.y, d = Math.hypot(dx, dy) || 1;
        ax += (dx / d) * pull.k; ay += (dy / d) * pull.k - G * Math.min(1, pull.k / 4000);
        b.vx *= 1 - 3 * h; b.vy *= 1 - 3 * h;
      }
      b.vx *= 1 - 0.25 * h; b.vy *= 1 - 0.25 * h;
      b.vx += ax * h; b.vy += ay * h;
      b.x += b.vx * h; b.y += b.vy * h;
      b.spin += (b.vx / Math.max(8, b.r)) * h;
      wall(b);
      vanes(b);
    }
    // ball-ball
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (pull && !pull.solid && (pull.ball === a || pull.ball === b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = rr - d;
        const ma = a.r * a.r, mb = b.r * b.r, ka = mb / (ma + mb), kb = ma / (ma + mb);
        a.x -= nx * over * ka; a.y -= ny * over * ka;
        b.x += nx * over * kb; b.y += ny * over * kb;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j2 = -(1 + 0.82) * rv;
          a.vx -= nx * j2 * ka; a.vy -= ny * j2 * ka;
          b.vx += nx * j2 * kb; b.vy += ny * j2 * kb;
          if (rv < -500) drum.bumps++;
        }
      }
    }
  }

  function wall(b) {
    const dx = b.x - drum.cx, dy = b.y - drum.cy, d = Math.hypot(dx, dy) || 1, lim = drum.r - b.r;
    if (d <= lim) return;
    const nx = dx / d, ny = dy / d;
    b.x = drum.cx + nx * lim; b.y = drum.cy + ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) {
      b.vx -= (1 + 0.6) * vn * nx; b.vy -= (1 + 0.6) * vn * ny;
      if (vn > 600) drum.bumps++;
    }
    // the glass drags the ball along with its rotation
    const tx = -ny, ty = nx, rim = drum.omega * drum.r, vt = b.vx * tx + b.vy * ty, f = (rim - vt) * 0.08;
    b.vx += tx * f; b.vy += ty * f;
  }

  function vanes(b) {
    for (let k = 0; k < VANES; k++) {
      const a = drum.ang + (k * Math.PI * 2) / VANES, c = Math.cos(a), s = Math.sin(a);
      const r0 = drum.r - drum.vaneLen, r1 = drum.r;
      // closest point of the vane segment to the ball
      const px = b.x - drum.cx, py = b.y - drum.cy;
      const t = Math.max(r0, Math.min(r1, px * c + py * s));
      const qx = c * t, qy = s * t, dx = px - qx, dy = py - qy, d = Math.hypot(dx, dy), lim = b.r + 5;
      if (d >= lim || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d;
      b.x += nx * (lim - d); b.y += ny * (lim - d);
      // velocity of the vane at that point
      const vx = -drum.omega * qy, vy = drum.omega * qx;
      const rv = (b.vx - vx) * nx + (b.vy - vy) * ny;
      if (rv < 0) { b.vx -= (1 + 0.5) * rv * nx; b.vy -= (1 + 0.5) * rv * ny; }
    }
  }

  return drum;
}

/** Positions of the vanes for drawing: [{x0,y0,x1,y1}] in design pixels. */
export function vaneLines(drum) {
  const out = [];
  for (let k = 0; k < VANES; k++) {
    const a = drum.ang + (k * Math.PI * 2) / VANES, c = Math.cos(a), s = Math.sin(a), r0 = drum.r - drum.vaneLen;
    out.push({ x0: drum.cx + c * r0, y0: drum.cy + s * r0, x1: drum.cx + c * (drum.r + 6), y1: drum.cy + s * (drum.r + 6) });
  }
  return out;
}
