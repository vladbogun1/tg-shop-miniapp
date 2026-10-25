// Host of the stream draw screen: loads participants, asks the server for a winner, lets the
// chosen visual animate to it. See VISUAL-CONTRACT.md.
import { VISUALS } from "./visuals/registry.js";
import { mockParticipants, mockDraw } from "./mock.js";

const qs = new URLSearchParams(location.search);
const MOCK = qs.has("mock") ? Number(qs.get("mock")) || 120 : 0;
const ROUNDS = 5;
const API = "/hw/api/admin";
const TOKEN_KEY = "tgshop_admin_jwt"; // the admin panel's token, same origin

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const state = { participants: [], winners: [], seedHash: "", visual: null, rolling: false };
const prefs = { avatars: true, sound: true };

// ---------- sound (synthesised, no files) ----------
let audio;
function sound(name) {
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
}

// ---------- server ----------
async function api(path, init = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(API + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401 || res.status === 403) throw new Error("Увійдіть в адмінку на цьому домені й оновіть сторінку");
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

async function load() {
  if (MOCK) {
    state.participants = mockParticipants(MOCK);
    state.seedHash = "mock";
    return;
  }
  const data = await api("/participants");
  state.participants = data.participants;
  state.winners = data.winners; // [{round, participantId}]
  state.seedHash = data.seedHash;
}

async function draw(reroll) {
  if (MOCK) {
    if (reroll && state.winners.length) {
      state.winners.pop();
    }
    const { winner, totalTickets } = mockDraw(state.participants);
    return { winner, round: state.winners.length + 1, totalTickets };
  }
  return api(reroll ? "/reroll" : "/draw", { method: "POST", body: "{}" });
}

// ---------- ui ----------
function markWon() {
  const ids = new Set(state.winners.map((w) => w.participantId));
  for (const p of state.participants) p.won = ids.has(p.id);
}

function renderRail() {
  const rail = $("rail");
  rail.innerHTML = "";
  for (let r = 1; r <= ROUNDS; r++) {
    const w = state.winners.find((x) => x.round === r);
    const p = w && state.participants.find((x) => x.id === w.participantId);
    const el = document.createElement("div");
    el.className = "slot" + (p ? "" : " empty");
    el.innerHTML = `<b>Раунд ${r}</b>`;
    el.append(p ? `${p.name}${p.handle ? " " + p.handle : ""}` : "—");
    rail.append(el);
  }
}

function renderStats() {
  const pool = state.participants.filter((p) => !p.won);
  const tickets = pool.reduce((s, p) => s + p.tickets, 0);
  const byP = state.participants.filter((p) => p.via.includes("pumpkins")).length;
  const byO = state.participants.filter((p) => p.via.includes("orders")).length;
  $("stats").textContent = `Учасники: ${state.participants.length} · квитки: ${tickets} · 🎃 ${byP} · 🛒 ${byO}`;
  $("seed").textContent = state.seedHash ? `seed sha256: ${state.seedHash.slice(0, 16)}…` : "";
  $("roll").disabled = state.rolling || state.winners.length >= ROUNDS || !pool.length;
  $("reroll").disabled = state.rolling || !state.winners.length;
}

function ctx() {
  return {
    sound,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    privacy: { avatars: prefs.avatars },
    size: { w: innerWidth, h: innerHeight },
  };
}

function visibleList() {
  return state.participants.map((p) => (prefs.avatars ? p : { ...p, avatar: null }));
}

async function mountVisual(id) {
  state.visual?.destroy?.();
  stage.innerHTML = "";
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0";
  stage.append(root);
  const mod = await import(VISUALS[id] ?? `./visuals/${id}/index.js`);
  document.title = `${mod.meta?.title ?? id} · Halloween Draw`;
  state.visual = mod.mount(root, ctx());
  state.visual.setParticipants(visibleList());
}

async function roll(reroll = false) {
  if (state.rolling) return;
  state.rolling = true;
  renderStats();
  $("msg").textContent = "";
  try {
    const res = await draw(reroll);
    const winner = state.participants.find((p) => p.id === (res.winner.id ?? res.winner)) ?? res.winner;
    state.visual.reset?.();
    if (reroll) {
      // The previous winner of that round is back in the pool (server already did that).
      state.winners = state.winners.filter((w) => w.round !== res.round);
      markWon();
      state.visual.setParticipants(visibleList());
    }
    const shown = prefs.avatars ? winner : { ...winner, avatar: null };
    await state.visual.roll(shown, { round: res.round, totalRounds: ROUNDS, totalTickets: res.totalTickets, seedHash: state.seedHash });
    state.winners.push({ round: res.round, participantId: winner.id });
    markWon();
    renderRail();
  } catch (e) {
    $("msg").textContent = String(e.message || e);
  } finally {
    state.rolling = false;
    renderStats();
  }
}

function setupControls() {
  const sel = $("visual");
  for (const id of Object.keys(VISUALS)) sel.add(new Option(id, id));
  const want = qs.get("visual");
  if (want && !VISUALS[want] && /^[a-z0-9-]+$/.test(want)) sel.add(new Option(want, want));
  sel.value = want && /^[a-z0-9-]+$/.test(want) ? want : Object.keys(VISUALS)[0];
  sel.onchange = () => {
    qs.set("visual", sel.value);
    history.replaceState(null, "", "?" + qs);
    mountVisual(sel.value).catch((e) => ($("msg").textContent = String(e)));
  };
  $("roll").onclick = () => roll(false);
  $("reroll").onclick = () => confirm("Перекрутити останній раунд? Попередній переможець повернеться в пул.") && roll(true);
  $("avatars").onchange = (e) => { prefs.avatars = e.target.checked; mountVisual(sel.value); };
  $("sound").onchange = (e) => { prefs.sound = e.target.checked; };
  $("hide").onclick = () => $("panel").classList.add("hidden");
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === "KeyR") roll(false);
    if (e.code === "KeyH") $("panel").classList.toggle("hidden");
    if (e.code === "KeyM") { prefs.sound = !prefs.sound; $("sound").checked = prefs.sound; }
  });
  return sel.value;
}

(async () => {
  const id = setupControls();
  try {
    await load();
    markWon();
    renderRail();
    renderStats();
    await mountVisual(id);
  } catch (e) {
    $("msg").textContent = String(e.message || e);
  }
  // Live: new participants keep coming until the stream starts.
  if (!MOCK) setInterval(async () => {
    if (state.rolling) return;
    try {
      const before = state.participants.length;
      await load();
      markWon();
      renderStats();
      if (state.participants.length !== before) state.visual?.setParticipants(visibleList());
    } catch { /* keep the screen */ }
  }, 30000);
})();
