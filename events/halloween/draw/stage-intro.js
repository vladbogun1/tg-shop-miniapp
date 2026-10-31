// Before every roll on the OBS scene: which lot is played now (name, photos, contents), then a 3-2-1
// countdown, then the visual rolls. The winner is already drawn on the server; this is only the show.
import { POOL_ICON, POOL_UK, el, isSuper, photoUrl, wait } from "./stage-common.js";

const SHOW_MS = 4800;
const SHOW_SUPER_MS = 6500;
const COUNT_MS = 950;

function card({ pool, round, total, pack, sup }) {
  const c = el("div", "intro-card");
  c.append(el("div", "intro-kicker", `${POOL_ICON[pool]} ${POOL_UK[pool]} · Раунд ${round} з ${total}`));
  if (sup) c.append(el("div", "intro-super", "⭐ Суперприз ⭐"));
  c.append(el("div", "intro-label", "Зараз розіграємо"));
  c.append(el("h1", "intro-name", pack?.name ?? `Приз раунду ${round}`));
  const pics = (pack?.images || []).slice(0, 4);
  if (pics.length) {
    const row = el("div", "intro-photos");
    pics.forEach((key, i) => {
      const img = el("img");
      img.src = photoUrl(key, 600);
      img.alt = "";
      img.style.animationDelay = `${300 + i * 140}ms`;
      row.append(img);
    });
    c.append(row);
  }
  if (pack?.items.length) {
    const ul = el("ul", "intro-items");
    for (const s of pack.items) ul.append(el("li", null, s));
    c.append(ul);
  }
  return c;
}

/** Plays the announcement in `root` and resolves when the overlay is gone. */
export async function playIntro(root, { pool, round, total, pack, sound }) {
  const sup = isSuper(round, total, pack?.name);
  root.innerHTML = "";
  root.classList.toggle("super", sup);
  const c = card({ pool, round, total, pack, sup });
  const count = el("div", "intro-count");
  root.append(c, count);
  void root.offsetWidth;
  root.classList.add("on");
  sound("whoosh");
  await wait(sup ? SHOW_SUPER_MS : SHOW_MS);
  c.classList.add("away");
  for (const n of ["3", "2", "1", "Погнали!"]) {
    count.textContent = n;
    count.classList.toggle("go", n.length > 1);
    count.classList.remove("tick");
    void count.offsetWidth;
    count.classList.add("tick");
    sound(n.length > 1 ? "boom" : "drum");
    await wait(n.length > 1 ? 700 : COUNT_MS);
  }
  root.classList.remove("on");
  await wait(450);
  root.innerHTML = "";
}
