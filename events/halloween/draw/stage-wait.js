// «Чекаємо відповідь»: after a win Maxim writes to the winner in Telegram and the OBS scene counts down
// the time to answer (minutes from the remote): who won, what, how much time is left, and the lots
// still in the game. Then «Відповів!» or «Час вийшов». Same pixel look as the pause (its backdrop).
// Data: the show state's `wait` (server/src/show.js) + /hw/api/stage/overview.
import { POOL_UK, el, lotPictures, packOf, photoUrl, plainName } from "./stage-common.js";
import { avatarOf, decor, freeLots, lotCard, ticker } from "./stage-pause.js";

const SEGMENTS = 24; // the time bar, in pixel blocks
const HURRY_MS = 30_000;
const LOTS_PER_PAGE = 5;
const PAGE_MS = 5000;

const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function winnerCard(person, pack, avatars) {
  const c = el("div", "w-card px");
  const who = el("div", "w-who");
  const ava = avatarOf(person || { name: "?" }, avatars);
  ava.classList.add("w-ava");
  const names = el("div", "w-names");
  names.append(el("div", "w-name", person?.name ?? "Переможець"));
  if (person?.handle) names.append(el("div", "w-handle", person.handle));
  who.append(ava, names);
  c.append(el("div", "w-tag", "Переможець"), who);
  const { set, keys } = lotPictures(pack, 1);
  const ph = el("div", "w-photo" + (set ? " set" : ""));
  if (keys[0]) {
    const img = el("img");
    img.src = photoUrl(keys[0], 600);
    img.alt = "";
    ph.append(img);
  }
  c.append(ph, el("div", "w-prize", plainName(pack?.name ?? "Приз раунду")));
  return c;
}

function timerBox() {
  const t = el("div", "w-timer px");
  const label = el("div", "w-label", "Час на відповідь");
  const digits = el("div", "w-digits", "00:00");
  const bar = el("div", "w-bar");
  for (let i = 0; i < SEGMENTS; i++) bar.append(el("i"));
  const hint = el("div", "w-hint", "Не відповість вчасно — перекрутимо раунд");
  t.append(label, digits, bar, hint);
  return { t, label, digits, bar: [...bar.children], hint };
}

function lotsStrip(pools) {
  const lots = freeLots(pools);
  const box = el("div", "w-lots");
  if (!lots.length) return box;
  box.append(el("h2", "p-title w-lots-title", `Ще в грі · ${lots.length}`));
  const pages = el("div", "w-pages");
  for (let i = 0; i < lots.length; i += LOTS_PER_PAGE) {
    const page = el("div", "w-page");
    for (const l of lots.slice(i, i + LOTS_PER_PAGE)) page.append(lotCard(l.pool, l.round, l.total, l.pack));
    pages.append(page);
  }
  box.append(pages);
  return box;
}

export function makeWait(root, sound) {
  let tick = 0;
  let pager = 0;
  let shownFor = ""; // pool/round/start + rev the screen was drawn for
  let parts = null;
  let wait = null;
  let skew = 0; // server clock − our clock
  let last = ""; // the state drawn last: running / hurry / over / answered

  function render() {
    if (!wait || !parts) return;
    const now = Date.now() + skew;
    const left = wait.endsAt - now;
    const total = Math.max(1, wait.endsAt - wait.startedAt);
    const st = wait.answeredAt ? "answered" : left <= 0 ? "over" : left <= HURRY_MS ? "hurry" : "running";
    root.dataset.state = st;
    if (st === "answered") {
      parts.label.textContent = "Є відповідь";
      parts.digits.textContent = "Відповів!";
      parts.hint.textContent = "Приз їде до переможця";
    } else if (st === "over") {
      parts.label.textContent = "Час на відповідь";
      parts.digits.textContent = "Час вийшов";
      parts.hint.textContent = "Відповіді немає — перекрутимо раунд";
    } else {
      parts.label.textContent = "Час на відповідь";
      parts.digits.textContent = mmss(left);
      parts.hint.textContent = "Не відповість вчасно — перекрутимо раунд";
    }
    const lit = st === "answered" ? SEGMENTS : Math.ceil((Math.max(0, left) / total) * SEGMENTS);
    parts.bar.forEach((b, i) => b.classList.toggle("on", i < lit));
    parts.head.textContent = st === "answered" ? "Зв'язок є!" : "Є переможець!";
    parts.sub.textContent = st === "answered" ? "Переможець відповів Максиму — вітаємо!" : "Максим пише переможцю в Telegram — чекаємо відповідь";
    if (st !== last) {
      if (last && st === "answered") sound("win");
      else if (last && st === "over") sound("boom");
      last = st;
    }
    if (st === "hurry" && left % 1000 < 260) sound("tick");
  }

  function pages() {
    clearInterval(pager);
    const list = [...root.querySelectorAll(".w-page")];
    let k = 0;
    list.forEach((p, i) => p.classList.toggle("on", i === 0));
    if (list.length < 2) return;
    pager = setInterval(() => {
      list[k].classList.remove("on");
      k = (k + 1) % list.length;
      list[k].classList.add("on");
    }, PAGE_MS);
  }

  return {
    /** Needs a fresh overview when `key` changed (another round, new data); otherwise only the clock moves. */
    key: (w, rev) => `${w.pool}/${w.test}/${w.round}/${w.startedAt}/${rev}`,
    needs(w, rev) {
      return this.key(w, rev) !== shownFor;
    },
    show(w, rev, overview, avatars, serverNow) {
      skew = serverNow - Date.now();
      wait = w;
      const pools = overview.pools;
      const d = pools.find((x) => x.pool === w.pool);
      const person = d?.participants.find((p) => p.id === w.winnerId);
      const pack = d ? packOf(d.prizes, w.round) : null;
      root.innerHTML = "";
      const head = el("header", "p-head w-head");
      const big = el("div", "p-big", "Є переможець!");
      const sub = el("div", "p-sub");
      head.append(el("div", "p-kicker", `${POOL_UK[w.pool]} · раунд ${w.round}`), big, sub);
      const timer = timerBox();
      const mid = el("div", "w-mid");
      mid.append(winnerCard(person, pack, avatars), timer.t);
      root.append(...decor(), head, mid, lotsStrip(pools), ticker(pools));
      parts = { ...timer, head: big, sub };
      root.classList.toggle("test", Boolean(overview.test));
      if (!root.classList.contains("on")) last = "";
      root.classList.add("on");
      shownFor = this.key(w, rev);
      pages();
      clearInterval(tick);
      tick = setInterval(render, 250);
      render();
    },
    /** Same countdown, new numbers (+ minutes, answered). */
    update(w, serverNow) {
      skew = serverNow - Date.now();
      wait = w;
      render();
    },
    hide() {
      clearInterval(tick);
      clearInterval(pager);
      wait = null;
      shownFor = "";
      last = "";
      root.classList.remove("on");
    },
    get on() {
      return root.classList.contains("on");
    },
  };
}
