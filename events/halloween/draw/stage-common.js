// Small helpers of the OBS scene overlays (stage-intro.js, stage-pause.js).

// Prize photos are S3 keys of product photos (through the shop's imgproxy, same origin on prod) or https links.
// Locally: stage.html?k=…&img=https://admin.chisetup.com.ua/img
const IMG = (new URLSearchParams(location.search).get("img") || "/img").replace(/\/$/, "");

export function photoUrl(key, size = 600) {
  if (/^https?:\/\//i.test(key)) return key;
  return `${IMG}/insecure/rs:fill:${size}:${size}/plain/s3://product-images/${key.replace(/^\/+/, "")}@webp`;
}

export const POOL_UK = { pumpkins: "Розіграш за гарбузи", orders: "Розіграш за покупки" };
export const POOL_ICON = { pumpkins: "🎃", orders: "🛍" };

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

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const sprite = (name) => new URL(`./assets/sprites/hw/${name}.webp`, import.meta.url).href;
