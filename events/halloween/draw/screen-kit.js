// What the old one-page screen (host.js) and the OBS scene (stage.js) both draw: the host sounds,
// the round rail and a mounted visual. See VISUAL-CONTRACT.md.
import { VISUALS } from "./visuals/registry.js";
import { lotPictures, photoUrl } from "./stage-common.js";

/** Short synthesised host sounds (no files); `prefs.sound` switches them off. */
export function makeSound(prefs) {
  let audio;
  return function sound(name) {
    if (!prefs.sound) return;
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.connect(g).connect(audio.destination);
    const env = (a, d, peak = 0.25) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    switch (name) {
      case "tick": o.type = "square"; o.frequency.setValueAtTime(1400, t); env(0.002, 0.04, 0.08); break;
      case "whoosh": o.type = "sawtooth"; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.35); env(0.05, 0.35, 0.08); break;
      case "drum": o.type = "triangle"; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.2); env(0.005, 0.25, 0.5); break;
      case "boom": o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8); env(0.01, 0.9, 0.7); break;
      case "win": o.type = "triangle"; [523, 659, 784, 1046].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * 0.12)); env(0.01, 0.8, 0.25); break;
      default: o.frequency.setValueAtTime(600, t); env(0.01, 0.1, 0.1);
    }
    o.start(t);
    o.stop(t + 1.2);
  };
}

/** prizes: { prizes: [{id, name, items}], rounds: {round: prizeId} } → the pack of a round or null. */
/** The prize of a round for a visual: name, contents and one picture for the winner screen —
 *  `picture` is a URL (the pack drawn as one scene, 3:2, when `set`; otherwise the first product photo, 1:1;
 *  null without photos). A photo: draw it smooth, not pixelated — only the art around it is pixel art. */
export function prizeOf(prizes, round) {
  const p = prizes.prizes.find((x) => x.id === prizes.rounds[round]);
  if (!p) return null;
  const { set, keys } = lotPictures(p, 1);
  return { name: p.name, items: p.items, picture: keys[0] ? photoUrl(keys[0], 480) : null, set };
}

/** One slot per round: the winner (masked name) and the prize. */
export function renderRail(rail, { rounds, winners, participants, prizes }) {
  rail.innerHTML = "";
  for (let r = 1; r <= rounds; r++) {
    const w = winners.find((x) => x.round === r);
    const p = w && participants.find((x) => x.id === w.participantId);
    const el = document.createElement("div");
    el.className = "slot" + (p ? "" : " empty");
    el.innerHTML = `<b>Раунд ${r}</b>`;
    el.append(p ? `${p.name}${p.handle ? " " + p.handle : ""}` : "—");
    const pr = prizeOf(prizes, r);
    if (pr) {
      const i = document.createElement("i");
      i.textContent = pr.name;
      el.append(i);
    }
    rail.append(el);
  }
}

export function visualCtx(sound, prefs) {
  return {
    sound,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    privacy: { avatars: prefs.avatars },
    size: { w: innerWidth, h: innerHeight },
  };
}

/** Replaces whatever is on `stage` with the visual `id`; returns its controller. */
export async function mountVisual(stage, id, ctx, previous) {
  previous?.destroy?.();
  stage.innerHTML = "";
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0";
  stage.append(root);
  const mod = await import(VISUALS[id] ?? `./visuals/${id}/index.js`);
  document.title = `${mod.meta?.title ?? id} · Halloween Draw`;
  return mod.mount(root, ctx);
}
