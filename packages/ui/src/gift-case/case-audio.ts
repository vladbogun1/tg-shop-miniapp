/**
 * Sounds of the gift case, synthesized with Web Audio (no files to download): the reel's «tick»,
 * the whoosh + boom of opening, the thud of the stop and the reveal sting (a fanfare for the rare
 * prizes). One AudioContext per page, created on a user gesture — iOS WebKit only lets a context
 * start inside a tap handler, so the page calls {@link unlockCaseAudio} in its own click handler
 * before it opens the overlay, and the overlay's «Відкрити» button calls it again.
 *
 * Mute is remembered in localStorage (wrapped: private mode / blocked storage just means «on»).
 */

const MUTE_KEY = "gift-case-muted";

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted: boolean | null = null;

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Creates/resumes the context. Call it from a click/tap handler. Never throws. */
export function unlockCaseAudio(): void {
  try {
    const C = audioCtor();
    if (!C) return;
    if (!ctx) {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.6);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

export function isCaseAudioMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setCaseAudioMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable — kept for this page only */
  }
}

function ready(): Ctx | null {
  if (!ctx || !master || isCaseAudioMuted() || ctx.state !== "running") return null;
  return ctx;
}

function env(c: Ctx, g: GainNode, at: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

function tone(type: OscillatorType, freq: number, at: number, peak: number, attack: number, decay: number, endFreq?: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, at + attack + decay);
  env(c, g, at, peak, attack, decay);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + attack + decay + 0.05);
}

function noiseBurst(at: number, dur: number, peak: number, filter: BiquadFilterType, f0: number, f1?: number, q = 1) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = filter;
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, at);
  if (f1) bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = c.createGain();
  env(c, g, at, peak, Math.min(0.004, dur / 4), dur);
  src.connect(bp).connect(g).connect(master!);
  src.start(at, Math.random() * 0.4);
  src.stop(at + dur + 0.05);
}

/** One reel tile crossing the marker: a short dry click, pitch slightly random. */
export function caseTick(): void {
  const c = ready();
  if (!c) return;
  try {
    const t = c.currentTime;
    noiseBurst(t, 0.028, 0.5, "bandpass", 2600 + Math.random() * 1200, undefined, 4);
    tone("square", 1700 + Math.random() * 500, t, 0.05, 0.002, 0.03);
  } catch {
    /* sound is decoration */
  }
}

/** The lid: a rising whoosh, then a low boom on the flash (~0.75 s later). */
export function caseOpenSound(): void {
  const c = ready();
  if (!c) return;
  try {
    const t = c.currentTime;
    noiseBurst(t, 0.8, 0.35, "lowpass", 300, 5000, 0.8);
    tone("sine", 110, t + 0.72, 0.9, 0.01, 0.7, 38);
    noiseBurst(t + 0.72, 0.45, 0.4, "lowpass", 2400, 200);
  } catch {
    /* sound is decoration */
  }
}

/** The reel stops. */
export function caseStopSound(): void {
  const c = ready();
  if (!c) return;
  try {
    const t = c.currentTime;
    tone("sine", 160, t, 0.7, 0.005, 0.28, 55);
    noiseBurst(t, 0.08, 0.3, "lowpass", 900);
  } catch {
    /* sound is decoration */
  }
}

const NOTE = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);

/**
 * The reveal: a bright bell for common/rare, an arpeggio for epic and a fanfare chord (plus a high
 * shimmer) for legendary/gold. `rank` — 0 (COMMON) … 4 (GOLD).
 */
export function caseRevealSound(rank: number): void {
  const c = ready();
  if (!c) return;
  try {
    const t = c.currentTime + 0.02;
    if (rank <= 1) {
      [NOTE(15), NOTE(22), NOTE(27)].forEach((f, i) => tone("sine", f, t + i * 0.05, 0.22, 0.005, 0.9));
      tone("triangle", NOTE(3), t, 0.12, 0.01, 0.5);
      return;
    }
    if (rank === 2) {
      [NOTE(3), NOTE(7), NOTE(10), NOTE(15), NOTE(19)].forEach((f, i) => tone("triangle", f, t + i * 0.07, 0.2, 0.01, 0.7));
      tone("sine", NOTE(27), t + 0.35, 0.12, 0.01, 1.1);
      return;
    }
    // Fanfare: C5 E5 G5 → C6 major chord held, brass-ish (saw through a lowpass), plus sparkle.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.connect(master!);
    const brass = (f: number, at: number, dur: number, peak: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.04);
      g.gain.setValueAtTime(peak, at + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(lp);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    brass(NOTE(3), t, 0.16, 0.12);
    brass(NOTE(7), t + 0.14, 0.16, 0.12);
    brass(NOTE(10), t + 0.28, 0.16, 0.12);
    [NOTE(15), NOTE(19), NOTE(22), NOTE(3)].forEach((f) => brass(f, t + 0.44, 1.5, 0.09));
    tone("sine", NOTE(-9), t + 0.44, 0.5, 0.01, 1.2, NOTE(-21));
    for (let i = 0; i < 8; i++) tone("sine", NOTE(27 + ((i * 5) % 12)), t + 0.5 + i * 0.07, 0.06, 0.005, 0.5);
  } catch {
    /* sound is decoration */
  }
}
