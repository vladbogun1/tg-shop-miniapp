// Звуки бою, синтез без файлів. Вимикаються тим самим перемикачем «звук», що й звуки хоста.
// rate < 1 — сповільнення: удари в слоумо звучать нижче й довше.
let ac = null, master = null, noiseBuf = null, rumble = null;

function on() {
  const cb = document.getElementById("sound");
  return !cb || cb.checked;
}
function init() {
  if (ac) return ac;
  try {
    ac = new AudioContext();
    master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ac = null; }
  return ac;
}
function noise(t, dur, type, f0, f1, peak, q = 1) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + Math.min(0.02, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}
function tone(t, dur, type, f0, f1, peak, attack = 0.004) {
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}

const last = {};
/** name: hit | heavy | clang | whoosh | step | land | ko | slowin | slowout | cast | poof | storm | crowd */
export function sfx(name, rate = 1, vol = 1) {
  if (!on() || !init()) return;
  if (ac.state === "suspended") ac.resume();
  const t = ac.currentTime;
  // the same sound twice within 40 ms is one sound
  if (last[name] && t - last[name] < 0.04) return;
  last[name] = t;
  const r = Math.max(0.25, rate), L = 1 / r, v = vol;
  switch (name) {
    case "whoosh": noise(t, 0.22 * L, "bandpass", 500 * r, 1900 * r, 0.22 * v, 1.4); break;
    case "hit":
      noise(t, 0.12 * L, "lowpass", 2600 * r, 400, 0.5 * v);
      tone(t, 0.18 * L, "sine", 150 * r, 50 * r, 0.55 * v); break;
    case "heavy":
      noise(t, 0.25 * L, "lowpass", 1800 * r, 120, 0.7 * v);
      tone(t, 0.45 * L, "sine", 110 * r, 32, 0.9 * v); tone(t, 0.12 * L, "square", 70 * r, 40, 0.12 * v); break;
    case "clang":
      for (const [f, a] of [[1180, 0.16], [1730, 0.12], [2690, 0.08], [3970, 0.05]]) tone(t, 0.5 * L, "sine", f * r, f * r * 0.985, a * v, 0.002);
      noise(t, 0.05 * L, "highpass", 3000 * r, 2000 * r, 0.25 * v); break;
    case "step": noise(t, 0.06 * L, "lowpass", 700 * r, 200, 0.12 * v); break;
    case "land":
      noise(t, 0.3 * L, "lowpass", 900 * r, 80, 0.45 * v); tone(t, 0.3 * L, "sine", 80 * r, 35, 0.5 * v); break;
    case "ko":
      tone(t, 1.6 * L, "sine", 90 * r, 24, 1.0 * v, 0.01); noise(t, 0.9 * L, "lowpass", 1400 * r, 60, 0.6 * v);
      tone(t, 0.9 * L, "triangle", 220 * r, 110 * r, 0.12 * v, 0.01); break;
    case "slowin":
      tone(t, 1.4, "sine", 160, 45, 0.5 * v, 0.05); noise(t, 0.9, "bandpass", 3000, 300, 0.2 * v, 0.8); break;
    case "slowout": noise(t, 0.5, "bandpass", 300, 2500, 0.2 * v, 0.8); break;
    case "cast":
      tone(t, 0.5 * L, "triangle", 300 * r, 1200 * r, 0.12 * v, 0.03); noise(t, 0.4 * L, "bandpass", 1200 * r, 3500 * r, 0.12 * v, 2); break;
    case "poof": noise(t, 0.25, "bandpass", 900, 300, 0.08 * v, 1.2); break;
    case "drop": tone(t, 0.7, "sine", 900, 120, 0.12 * v, 0.02); noise(t, 0.6, "highpass", 4000, 900, 0.08 * v); break;
    default: break;
  }
}

/** Low storm rumble under the whole roll; level 0..1, 0 stops it. */
export function stormLevel(level) {
  if (!ac) { if (level <= 0 || !init()) return; }
  if (!on()) level = 0;
  if (!rumble && level > 0) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 160;
    const g = ac.createGain(); g.gain.value = 0;
    s.connect(f).connect(g).connect(master); s.start();
    rumble = { s, g };
  }
  if (rumble) rumble.g.gain.setTargetAtTime(level * 0.35, ac.currentTime, 0.4);
}

export function stopAll() {
  if (rumble) { try { rumble.s.stop(); } catch { /* already stopped */ } rumble = null; }
}
