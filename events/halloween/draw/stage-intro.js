// Before every roll on the OBS scene: which lot is played now (name, photos, contents), then a 3-2-1
// countdown, then the visual rolls. The winner is already drawn on the server; this is only the show.
// A super prize first gets its own entrance: the knights' hall and «СУПЕРПРИЗ», then the lot.
// Pixel art throughout (assets/scenes, tools/art), like the pause screen and the mascot.
import { POOL_UK, el, isSuper, lotPictures, photoUrl, scene, titleName, wait } from "./stage-common.js";

const SHOW_MS = 6000; // long enough for Maxim to read the lot out
const SUPER_ENTRANCE_MS = 2800;
const SHOW_SUPER_MS = 7500;
const COUNT_MS = 1000;

function card({ pool, round, total, pack, sup }) {
  const c = el("div", "intro-card");
  c.append(el("div", "intro-kicker", `${POOL_UK[pool]} · Раунд ${round} з ${total}`));
  c.append(el("div", "intro-label", sup ? "Розігруємо суперприз" : "Зараз розіграємо"));
  const name = titleName(pack?.name ?? `Приз раунду ${round}`);
  // «Суперприз: …» — the label above already says it
  c.append(el("h1", "intro-name", sup ? name.replace(/^суперприз\s*[:—-]\s*/i, "") : name));
  const { set, keys: pics } = lotPictures(pack);
  if (pics.length) {
    const row = el("div", set ? "intro-photos set" : pics.length === 1 ? "intro-photos one" : "intro-photos");
    pics.forEach((key, i) => {
      const f = el("div", "intro-photo px");
      const img = el("img");
      img.src = photoUrl(key, 150); // small on purpose: shown pixelated
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

/** Plays the announcement in `root` and resolves when the overlay is gone. */
export async function playIntro(root, { pool, round, total, pack, sound }) {
  const sup = isSuper(round, total, pack?.name);
  root.innerHTML = "";
  root.classList.toggle("super", sup);
  const bg = el("img", "intro-bg");
  bg.src = scene(sup ? "scene-knights" : "intro-stage");
  bg.alt = "";
  const count = el("div", "intro-count");
  root.append(bg, count);
  void root.offsetWidth;
  root.classList.add("on");
  sound("whoosh");
  if (sup) {
    const banner = el("div", "intro-superbanner", "Суперприз");
    root.append(banner);
    sound("boom");
    await wait(SUPER_ENTRANCE_MS);
    banner.classList.add("away");
  }
  const c = card({ pool, round, total, pack, sup });
  root.append(c);
  await wait(sup ? SHOW_SUPER_MS : SHOW_MS);
  c.classList.add("away");
  for (const n of ["3", "2", "1", "Погнали!"]) {
    count.textContent = n;
    count.classList.toggle("go", n.length > 1);
    count.classList.remove("tick");
    void count.offsetWidth;
    count.classList.add("tick");
    sound(n.length > 1 ? "boom" : "drum");
    await wait(n.length > 1 ? 800 : COUNT_MS);
  }
  root.classList.remove("on");
  await wait(450);
  root.innerHTML = "";
}
