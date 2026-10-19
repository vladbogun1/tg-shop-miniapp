/**
 * A tiny canvas confetti/sparks burst for the gift case reveal (no dependency). Particles are
 * drawn on one full-screen canvas, the loop stops by itself when the last one is gone.
 */

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
  max: number;
  kind: 0 | 1 | 2; // 0 rect confetti, 1 triangle, 2 spark streak
}

export interface BurstOptions {
  /** Centre of the burst in CSS px. */
  x: number;
  y: number;
  colors: string[];
  count: number;
  /** Initial speed, px/s. */
  power: number;
  /** Share of spark streaks (0..1). */
  sparks?: number;
}

export class CaseBurst {
  private parts: P[] = [];
  private raf = 0;
  private last = 0;
  private ctx: CanvasRenderingContext2D | null;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d");
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
  }

  burst(o: BurstOptions) {
    const sparks = o.sparks ?? 0.35;
    for (let i = 0; i < o.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spark = Math.random() < sparks;
      const sp = o.power * (0.35 + Math.random() * 0.75) * (spark ? 1.35 : 1);
      const max = spark ? 0.5 + Math.random() * 0.5 : 1.4 + Math.random() * 1.4;
      this.parts.push({
        x: o.x,
        y: o.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (spark ? 0 : o.power * 0.35),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        w: spark ? 2 : 5 + Math.random() * 6,
        h: spark ? 10 + Math.random() * 14 : 3 + Math.random() * 5,
        color: o.colors[i % o.colors.length],
        life: 0,
        max,
        kind: spark ? 2 : Math.random() < 0.3 ? 1 : 0,
      });
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.ctx;
    if (!c) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const drag = Math.pow(0.12, dt);
    const alive: P[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vx *= drag;
      p.vy = p.vy * drag + (p.kind === 2 ? 300 : 820) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const fade = 1 - Math.pow(p.life / p.max, 3);
      c.globalAlpha = Math.max(0, fade);
      c.fillStyle = p.color;
      c.save();
      c.translate(p.x, p.y);
      if (p.kind === 2) {
        c.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        c.rotate(p.rot);
        // a flat piece of paper flipping in 3D: squash one axis
        const sy = Math.cos(p.rot * 1.7);
        if (p.kind === 1) {
          c.beginPath();
          c.moveTo(0, -p.w * 0.6 * sy);
          c.lineTo(p.w * 0.6, p.w * 0.5 * sy);
          c.lineTo(-p.w * 0.6, p.w * 0.5 * sy);
          c.closePath();
          c.fill();
        } else {
          c.fillRect(-p.w / 2, (-p.h / 2) * sy, p.w, p.h * sy);
        }
      }
      c.restore();
      alive.push(p);
    }
    c.globalAlpha = 1;
    this.parts = alive;
    this.raf = alive.length ? requestAnimationFrame(this.frame) : 0;
    if (!alive.length) c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  };

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.parts = [];
  }
}
