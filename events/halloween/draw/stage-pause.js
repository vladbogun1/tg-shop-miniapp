// The between-rounds screen of the OBS scene: «Розіграш триває», both draws' progress, a few scenes in
// turn (lots still to play, a pixel-art interlude, the participants scrolling, who already won) and a
// ticker of names. One look with the mascot: pixel art (assets/scenes, tools/art), pixel font and frames.
// Data: /hw/api/stage/overview (both draws, masked names only — what the stream shows anyway).
import { POOL_SHORT, POOL_UK, el, isSuper, lotPictures, packOf, photoUrl, plainName, scene, sprite } from "./stage-common.js";

const PAGE_MS = 4500; // one page of lots
const NAMES_MS = 14_000;
const WINNERS_MS = 10_000;
const ART_MS = 8000;
/** Full-screen pixel-art interludes between the info scenes. */
const ART = {
  cauldron: "Котел ще варить призи — наступний лот уже близько",
  pumpkins: "Гарбузи рахують ваші квитки…",
};
const LOTS_PER_PAGE = 4;
const COLUMNS = 5;

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

function avatarOf(p, avatars) {
  if (avatars && p.avatar) {
    const img = el("img", "p-ava");
    img.src = p.avatar;
    img.alt = "";
    img.onerror = () => img.replaceWith(el("span", "p-ava", [...p.name][0] || "?"));
    return img;
  }
  return el("span", "p-ava", [...p.name][0] || "?");
}

function lotCard(pool, round, total, pack) {
  const sup = isSuper(round, total, pack?.name);
  const c = el("div", "p-lot px" + (sup ? " super" : ""));
  const ph = el("div", "p-lot-photo");
  const { set, keys } = lotPictures(pack, 1);
  const key = keys[0];
  if (set) ph.classList.add("set");
  if (key) {
    const img = el("img");
    img.src = photoUrl(key, 120); // small on purpose: shown pixelated, like the rest of the art
    img.alt = "";
    ph.append(img);
  } else {
    ph.append(el("span", "p-lot-none", "?"));
  }
  c.append(ph);
  c.append(el("div", "p-lot-round", `${POOL_SHORT[pool]} · раунд ${round}`));
  c.append(el("div", "p-lot-name", plainName(pack?.name ?? "Сюрприз")));
  return c;
}

/** Free rounds of both draws, the super prizes last, as cards. */
function lotsScene(pools) {
  const lots = [];
  for (const d of pools) {
    const played = new Set(d.winners.map((w) => w.round));
    for (let r = 1; r <= d.rounds; r++) if (!played.has(r)) lots.push({ pool: d.pool, round: r, total: d.rounds, pack: packOf(d.prizes, r) });
  }
  if (!lots.length) return null;
  lots.sort((a, b) => Number(isSuper(a.round, a.total, a.pack?.name)) - Number(isSuper(b.round, b.total, b.pack?.name)));
  const s = el("section", "p-scene p-lots");
  s.append(el("h2", "p-title", `Ще в грі · ${lots.length} ${lots.length === 1 ? "лот" : lots.length < 5 ? "лоти" : "лотів"}`));
  const pages = el("div", "p-pages");
  for (let i = 0; i < lots.length; i += LOTS_PER_PAGE) {
    const page = el("div", "p-page");
    for (const l of lots.slice(i, i + LOTS_PER_PAGE)) page.append(lotCard(l.pool, l.round, l.total, l.pack));
    pages.append(page);
  }
  s.append(pages);
  return s;
}

/** Everyone still in the game, once even if they play both draws (the id is the same in both). */
function stillIn(pools) {
  const byId = new Map();
  for (const p of pools.flatMap((d) => d.participants.filter((x) => !x.won))) {
    const had = byId.get(p.id);
    byId.set(p.id, had ? { ...had, tickets: had.tickets + p.tickets } : p);
  }
  return [...byId.values()];
}

function namesScene(pools, avatars) {
  const people = stillIn(pools);
  if (!people.length) return null;
  const s = el("section", "p-scene p-names");
  s.dataset.ms = NAMES_MS;
  const tickets = people.reduce((n, p) => n + p.tickets, 0);
  s.append(el("h2", "p-title", `Учасники · ${people.length} · квитків ${tickets}`));
  const cols = el("div", "p-cols");
  const list = shuffle(people);
  const per = Math.ceil(list.length / COLUMNS);
  for (let c = 0; c < COLUMNS; c++) {
    const part = list.slice(c * per, (c + 1) * per);
    if (!part.length) break;
    const col = el("div", "p-col");
    const track = el("div", "p-track");
    // twice, so the loop is seamless; short columns do not move
    const copies = part.length > 8 ? 2 : 1;
    for (let k = 0; k < copies; k++) {
      for (const p of part) {
        const row = el("div", "p-person");
        row.append(avatarOf(p, avatars), el("span", "p-pname", p.name), el("span", "p-tix", `×${p.tickets}`));
        track.append(row);
      }
    }
    if (copies === 2) {
      track.classList.add("move");
      track.style.animationDuration = `${part.length * 1.6}s`;
      track.style.animationDirection = c % 2 ? "reverse" : "normal";
    }
    col.append(track);
    cols.append(col);
  }
  s.append(cols);
  return s;
}

function winnersScene(pools) {
  const rows = [];
  for (const d of pools) {
    for (const w of [...d.winners].sort((a, b) => a.round - b.round)) {
      const p = d.participants.find((x) => x.id === w.participantId);
      rows.push({ pool: d.pool, round: w.round, name: p?.name ?? "Переможець", pack: packOf(d.prizes, w.round) });
    }
  }
  if (!rows.length) return null;
  const s = el("section", "p-scene p-winners");
  s.dataset.ms = WINNERS_MS;
  s.append(el("h2", "p-title", `Вже виграли · ${rows.length}`));
  const grid = el("div", "p-wgrid");
  for (const r of rows.slice(-12)) {
    const row = el("div", "p-win");
    row.append(el("span", "p-win-round", `${POOL_SHORT[r.pool]} · ${r.round}`), el("b", null, r.name), el("span", "p-win-prize", plainName(r.pack?.name ?? "")));
    grid.append(row);
  }
  s.append(grid);
  return s;
}

function ticker(pools) {
  const names = shuffle(stillIn(pools).map((p) => p.name));
  const t = el("div", "p-ticker");
  const run = el("div", "p-run");
  const line = names.slice(0, 120).join("   ·   ");
  run.append(el("span", null, line + "   ·   "), el("span", null, line + "   ·   "));
  run.style.animationDuration = `${Math.max(40, line.length / 9)}s`;
  t.append(run);
  return t;
}

function stats(pools) {
  const box = el("div", "p-stats");
  for (const d of pools) {
    const chip = el("div", "p-chip px");
    chip.append(el("b", null, POOL_UK[d.pool]), el("span", null, `зіграно ${d.winners.length} з ${d.rounds} · ${d.participants.length} учасників`));
    box.append(chip);
  }
  return box;
}

function artScene(name) {
  const s = el("section", "p-scene p-artcap");
  s.dataset.art = name;
  s.dataset.ms = ART_MS;
  s.append(el("div", "p-banner px", ART[name]));
  return s;
}

function decor() {
  const bg = el("div", "p-bg");
  const night = el("img", "p-night");
  night.src = scene("bg-night");
  night.alt = "";
  bg.append(night);
  for (const name of Object.keys(ART)) {
    const art = el("img", "p-art");
    art.src = scene(`scene-${name}`);
    art.alt = "";
    art.dataset.name = name;
    bg.append(art);
  }
  for (let i = 0; i < 26; i++) {
    const f = el("i", "p-spark");
    f.style.left = `${Math.random() * 100}%`;
    f.style.animationDelay = `${-Math.random() * 14}s`;
    f.style.animationDuration = `${9 + Math.random() * 9}s`;
    f.style.setProperty("--s", (0.5 + Math.random() * 1.4).toFixed(2));
    bg.append(f);
  }
  const host = el("img", "p-host");
  host.src = sprite("host");
  host.alt = "";
  const pot = el("img", "p-pot");
  pot.src = sprite("cauldron");
  pot.alt = "";
  return [bg, host, pot];
}

export function makePause(root) {
  let timer = 0;
  let scenes = [];
  let idx = 0;

  /** Shows the next scene; the lots scene turns its pages first. One timer at a time. */
  function next() {
    clearTimeout(timer);
    if (!scenes.length) return;
    const cur = scenes[idx];
    scenes.forEach((x) => x.classList.toggle("on", x === cur));
    root.dataset.art = cur.dataset.art || "";
    idx = (idx + 1) % scenes.length;
    const pages = [...cur.querySelectorAll(".p-page")];
    if (!pages.length) {
      timer = setTimeout(next, Number(cur.dataset.ms) || NAMES_MS);
      return;
    }
    let k = 0;
    pages.forEach((p, i) => p.classList.toggle("on", i === 0));
    const turn = () => {
      if (++k >= pages.length) return next();
      pages[k - 1].classList.remove("on");
      pages[k].classList.add("on");
      timer = setTimeout(turn, PAGE_MS);
    };
    timer = setTimeout(turn, PAGE_MS);
  }

  return {
    /** Draws the screen from a fresh overview; keeps the current scene index. */
    show(overview, avatars) {
      const pools = overview.pools;
      root.innerHTML = "";
      const head = el("header", "p-head");
      head.append(el("div", "p-kicker", "ChiSetup · Halloween"), el("div", "p-big", "Розіграш триває"), el("div", "p-sub", "Наступний раунд — зовсім скоро, не перемикайся"));
      scenes = [lotsScene(pools), artScene("cauldron"), namesScene(pools, avatars), artScene("pumpkins"), winnersScene(pools)].filter(Boolean);
      const stage = el("div", "p-stagebox");
      stage.append(...scenes);
      root.append(...decor(), head, stats(pools), stage, ticker(pools));
      root.classList.toggle("test", Boolean(overview.test));
      root.classList.add("on");
      idx = Math.min(idx, Math.max(0, scenes.length - 1));
      clearTimeout(timer);
      next();
    },
    hide() {
      clearTimeout(timer);
      root.classList.remove("on");
    },
    get on() {
      return root.classList.contains("on");
    },
  };
}
