// Before every roll on the OBS scene: which lot is played now (name, photos, contents), then a 3-2-1.
// With the two-step remote the lot comes first on its own (showLot, «announce»), the roll then only counts down.
// Then the visual rolls. The winner is already drawn on the server; this is only the show.
// A super prize first gets its own entrance: the knights' hall and «СУПЕРПРИЗ», then the lot.
// Pixel art throughout (assets/scenes, tools/art), like the pause screen and the mascot.
import { t } from "./lang.js";
import { poolTitle, el, isSuper, lotPictures, photoUrl, scene, titleName, wait } from "./stage-common.js";

const SHOW_MS = 6000; // long enough for Maxim to read the lot out
const SUPER_ENTRANCE_MS = 2800;
const SHOW_SUPER_MS = 7500;
const COUNT_MS = 1000;

function card({ pool, round, total, pack, sup }) {
  const c = el("div", "intro-card");
  c.append(el("div", "intro-kicker", `${poolTitle(pool)} · ${t("Раунд", "Раунд")} ${round} ${t("з", "из")} ${total}`));
  c.append(el("div", "intro-label", sup ? t("Розігруємо суперприз", "Разыгрываем суперприз") : t("Зараз розіграємо", "Сейчас разыграем")));
  const name = titleName(pack?.name ?? `${t("Приз раунду", "Приз раунда")} ${round}`);
  // «Суперприз: …» — the label above already says it
  c.append(el("h1", "intro-name", sup ? name.replace(/^суперприз\s*[:—-]\s*/i, "") : name));
  const { set, keys: pics } = lotPictures(pack);
  if (pics.length) {
    const row = el("div", set ? "intro-photos set" : pics.length === 1 ? "intro-photos one" : "intro-photos");
    pics.forEach((key, i) => {
      const f = el("div", "intro-photo px");
      const img = el("img");
      img.src = photoUrl(key, 600); // photos stay sharp: only the art around them is pixel art
      img.alt = "";
      f.append(img);
      f.style.animationDelay = `${300 + i * 160}ms`;
      row.append(f);
    });
    c.append(row);
  }
  if (pack?.items.length) {
    const ul = el("ul", "intro-items");
    for (const s of pack.items) ul.append(el("li", "px", s));
    c.append(ul);
  }
  return c;
}

// A newer intro (or a roll) takes the overlay over; an older one stops touching it.
let token = 0;
let lotOnly = -1; // the token of the running showLot, if it is the newest

/** The intro stage, the super prize entrance and the lot card; returns the card. */
async function lot(root, { pool, round, total, pack, sound }, my) {
  const sup = isSuper(round, total, pack?.name);
  root.innerHTML = "";
  root.classList.remove("count-only");
  root.classList.toggle("super", sup);
  const bg = el("img", "intro-bg");
  bg.src = scene(sup ? "scene-knights" : "intro-stage");
  bg.alt = "";
  root.append(bg);
  void root.offsetWidth;
  root.classList.add("on");
  sound("whoosh");
  if (sup) {
    const banner = el("div", "intro-superbanner", t("Суперприз", "Суперприз"));
    root.append(banner);
    sound("boom");
    await wait(SUPER_ENTRANCE_MS);
    if (my !== token) return null;
    banner.classList.add("away");
  }
  const c = card({ pool, round, total, pack, sup });
  root.append(c);
  await wait(sup ? SHOW_SUPER_MS : SHOW_MS);
  return my === token ? c : null;
}

async function countdown(root, sound) {
  const count = el("div", "intro-count");
  root.append(count);
  for (const n of ["3", "2", "1", t("Погнали!", "Погнали!")]) {
    count.textContent = n;
    count.classList.toggle("go", n.length > 1);
    count.classList.remove("tick");
    void count.offsetWidth;
    count.classList.add("tick");
    sound(n.length > 1 ? "boom" : "drum");
    await wait(n.length > 1 ? 800 : COUNT_MS);
  }
}

async function close(root, my) {
  root.classList.remove("on");
  await wait(450);
  if (my === token) { root.innerHTML = ""; root.classList.remove("count-only"); }
}

/**
 * Step one of a round (the remote's «announce»): the lot, then the overlay fades and the chosen visual
 * waits on screen for «Начать». Nothing is drawn yet. Resolves when done or when a roll took over.
 */
export async function showLot(root, opts) {
  const my = ++token;
  lotOnly = my;
  const c = await lot(root, opts, my);
  if (!c) return;
  c.classList.add("away");
  await close(root, my);
}

/** The announcement was cancelled: take a lot card that is still up off. A countdown is left alone. */
export function dropLot(root) {
  if (lotOnly !== token || !root.classList.contains("on")) return;
  close(root, ++token);
}

/**
 * Before a roll: the lot and a 3-2-1, resolves when the overlay is gone. `lotShown` — the lot was announced
 * just before, so only the countdown runs, over the visual.
 */
export async function playIntro(root, { lotShown, ...opts }) {
  const my = ++token;
  if (lotShown) {
    root.innerHTML = "";
    root.classList.remove("super");
    root.classList.add("count-only");
    void root.offsetWidth;
    root.classList.add("on");
  } else {
    const c = await lot(root, opts, my);
    if (!c) return;
    c.classList.add("away");
  }
  await countdown(root, opts.sound);
  await close(root, my);
}
