// Small helpers of the OBS scene overlays (stage-intro.js, stage-pause.js).

// Prize photos are S3 keys of product photos (through the shop's imgproxy, same origin on prod) or https links.
// Locally: stage.html?k=…&img=https://admin.chisetup.com.ua/img
const IMG = (new URLSearchParams(location.search).get("img") || "/img").replace(/\/$/, "");

export function photoUrl(key, size = 600) {
  if (/^https?:\/\//i.test(key)) return key;
  return `${IMG}/insecure/rs:fill:${size}:${size}/plain/s3://product-images/${key.replace(/^\/+/, "")}@webp`;
}

export const POOL_UK = { pumpkins: "Розіграш за гарбузи", orders: "Розіграш за покупки" };
/** Short tag of a draw (no emoji: the overlays are pixel art, an emoji would break the look). */
export const POOL_SHORT = { pumpkins: "Гарбузи", orders: "Покупки" };

/** The same rule as the remote: the last round or a pack named «Суперприз…» plays the knights. */
export const isSuper = (round, total, name) => round === total || /суперприз/i.test(name || "");

/** The pack of a round with its photos, or null. */
export function packOf(prizes, round) {
  const p = prizes?.prizes.find((x) => x.id === prizes.rounds[round]);
  return p ? { name: p.name, items: p.items || [], images: p.images || [] } : null;
}

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** The one font of the scene (declared in stage.css); canvas visuals use it too. */
export const FONT = '"Tektur", "Exo 2", system-ui, sans-serif';

const NBSP = " ";

/** A pack name without leading emoji (the overlays are pixel art; «⭐ Суперприз: …» → «Суперприз: …»),
 *  with non-breaking spaces where a line break reads badly: before «+», after a short preposition
 *  («з», «до», «на»), before «XL» / a size. */
export function plainName(s) {
  return s
    .replace(/^[⭐️\u{1F300}-\u{1FAFF}\s]+/u, "")
    .replace(/ \+ /g, `${NBSP}+ `)
    .replace(/(^|\s)([а-яієїґ]{1,2}) /giu, (m, sp, w) => (w === w.toLowerCase() ? `${sp}${w}${NBSP}` : m))
    .replace(/ (XL|XXL|L|M|S|\d+×\d+)\b/g, `${NBSP}$1`);
}

/** For the big title only (wide enough): a short «quoted name» stays on one line. */
export const titleName = (s) => plainName(s).replace(/«([^»]{1,28})»/g, (m) => m.replace(/ /g, NBSP));

export const wait =(ms) => new Promise((r) => setTimeout(r, ms));

export const scene = (name) => new URL(`./assets/scenes/${name}.webp`, import.meta.url).href;

export const sprite = (name) => new URL(`./assets/sprites/hw/${name}.webp`, import.meta.url).href;
