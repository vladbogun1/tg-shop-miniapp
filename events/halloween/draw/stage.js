// The OBS scene (stage.html?k=<scene key>): no buttons, no admin token. It follows the show state from
// the server (server/src/show.js) — pool, rehearsal, visual, avatars, sound, blackout, hidden (transparent),
// pause (the between-rounds screen) — and plays every roll the remote starts: the lot and a 3-2-1
// (stage-intro.js), then the visual; then tells the server the winner is on screen.
// The address and the key must not change: the link sits in Maxim's OBS.
import { VISUALS } from "./visuals/registry.js";
import { makeSound, prizeOf, visualCtx, mountVisual } from "./screen-kit.js";
import { packOf } from "./stage-common.js";
import { playIntro } from "./stage-intro.js";
import { makePause } from "./stage-pause.js";

const K = new URLSearchParams(location.search).get("k") || "";
const $ = (id) => document.getElementById(id);
const prefs = { avatars: true, sound: true };
const sound = makeSound(prefs);
const PLAY_WINDOW_MS = 5 * 60_000; // a scene (re)opened later than this after a roll does not replay it

let data = null; // stage/screen: participants, winners, prizes, rounds, seedHash
let visual = null;
let mounted = ""; // visual id + avatars the visual was mounted with
let rev = -1;
let playedId = 0;
let latest = null; // the newest show state; older ones are skipped while a roll plays
let busy = false;
let pauseRev = -1; // the rev the pause screen was drawn for
const pause = makePause($("pause"));

function say(text) {
  $("scene-msg").hidden = !text;
  $("scene-msg").textContent = text || "";
}

async function screen() {
  const res = await fetch(`/hw/api/stage/screen?k=${encodeURIComponent(K)}`, { cache: "no-store" });
  if (res.status === 403) throw new Error("Невірний ключ сцени: скопіюйте посилання з пульта ще раз");
  if (!res.ok) throw new Error(`Сцена: ${res.status}`);
  return res.json();
}

const visibleList = () => data.participants.map((p) => (prefs.avatars ? p : { ...p, avatar: null }));

function paint() {
  visual?.setParticipants(visibleList());
  // Rounds go in any order: the next lot is announced by stage-intro.js, the visual gets it in roll().
  visual?.setPrize?.(null);
}

async function play(r) {
  playedId = r.id;
  data = await screen();
  // The server already counts the winner; keep them in the crowd until the reveal.
  data.winners = data.winners.filter((w) => w.round !== r.round);
  const winner = data.participants.find((p) => p.id === r.winnerId);
  if (!winner) return;
  winner.won = false;
  visual.reset?.();
  paint();
  const shown = prefs.avatars ? winner : { ...winner, avatar: null };
  await playIntro($("intro"), { pool: r.pool, round: r.round, total: data.rounds, pack: packOf(data.prizes, r.round), sound });
  await visual.roll(shown, { round: r.round, totalRounds: data.rounds, totalTickets: r.totalTickets, seedHash: data.seedHash, prize: prizeOf(data.prizes, r.round) });
  data.winners.push({ round: r.round, participantId: winner.id });
  winner.won = true;
  fetch(`/hw/api/stage/revealed?k=${encodeURIComponent(K)}`, { method: "POST", body: JSON.stringify({ id: r.id }) }).catch(() => {});
}

async function apply(s) {
  prefs.sound = s.sound;
  document.body.classList.toggle("test", s.test);
  $("scene-black").classList.toggle("on", s.blackout);
  document.documentElement.classList.toggle("ghost", s.hidden);
  const want = (s.visual && /^[a-z0-9-]+$/.test(s.visual) ? s.visual : Object.keys(VISUALS)[0]) + (s.avatars ? "" : ":noava");
  const r = s.roll;
  const fresh = r && r.id !== playedId && !r.revealedAt && Date.now() - r.at < PLAY_WINDOW_MS && r.pool === s.pool && r.test === s.test;
  if (want !== mounted) {
    prefs.avatars = s.avatars;
    data = await screen();
    visual = await mountVisual($("stage"), want.split(":")[0], visualCtx(sound, prefs), visual);
    mounted = want;
    rev = s.rev;
    paint();
  } else if (s.rev !== rev && !fresh) {
    rev = s.rev;
    data = await screen();
    visual.reset?.();
    paint();
  }
  if (fresh) {
    rev = s.rev;
    pause.hide();
    await play(r);
  } else if (r) {
    playedId = Math.max(playedId, r.id); // seen: never replay an old roll after a reconnect
  }
  await syncPause(s, fresh);
}

async function syncPause(s, fresh) {
  if (!s.pause || fresh) return pause.hide();
  if (pause.on && pauseRev === s.rev) return;
  const res = await fetch(`/hw/api/stage/overview?k=${encodeURIComponent(K)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Пауза: ${res.status}`);
  pauseRev = s.rev;
  pause.show(await res.json(), s.avatars);
}

async function drain() {
  if (busy) return;
  busy = true;
  try {
    while (latest) {
      const s = latest;
      latest = null;
      try {
        await apply(s);
        say("");
      } catch (e) {
        say(String(e.message || e));
      }
    }
  } finally {
    busy = false;
  }
}

function connect() {
  if (!K) return say("Немає ключа сцени: відкрийте посилання з пульта");
  const es = new EventSource(`/hw/api/stage/events?k=${encodeURIComponent(K)}&as=stage`);
  es.onmessage = (e) => {
    latest = JSON.parse(e.data);
    drain();
  };
  // EventSource reconnects by itself; a wrong key never connects, so check it once.
  es.onerror = () => screen().catch((e) => say(String(e.message || e)));
}

connect();
