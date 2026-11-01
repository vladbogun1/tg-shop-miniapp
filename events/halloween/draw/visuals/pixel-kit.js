// Shared canvas helpers that keep every visual in the 16-bit look of the OBS overlays (stage.css, assets/scenes):
// one pixel font, notched pixel frames, hard stepped shadows instead of blur, dithered glows instead of
// radial gradients, pixelated photos. Used by the visuals only; the overlays have their own CSS (.px, .pxt).
import * as common from "../stage-common.js";
export { t } from "../lang.js";

/** One art pixel of the scenes at 1920×1080. */
export const PX = 4;

export const PAL = {
  ink: "#0e0e10",
  plum: "#1a0f24",
  plum2: "#2a1838",
  orange: "#ff6600",
  amber: "#ffb15c",
  gold: "#ffd36b",
  slime: "#7cff4f",
  violet: "#8a3ffc",
  bone: "#f4f1ea",
  rust: "#7a2c00",
  moss: "#1f5c10",
};

const FALLBACK = '"Pixelify Sans"';
/** The pixel font family of the scene (stage-common.js FONT, else body.scene's font-family). */
export function fontFamily() {
  if (common.FONT) return common.FONT;
  const css = document.body?.classList.contains("scene") ? getComputedStyle(document.body).fontFamily : "";
  return css && !/exo/i.test(css.split(",")[0]) ? css : FALLBACK;
}
export const font = (size, weight = 700) => `${weight} ${Math.round(size)}px ${fontFamily()}`;

let fontReady = null;
/** Resolves when the pixel font is usable on a canvas. Outside stage.html (the old host page) it pulls stage.css in. */
export function ensureFont() {
  if (fontReady) return fontReady;
  const fam = fontFamily().split(",")[0].replace(/["']/g, "").trim();
  const declared = [...document.fonts].some((f) => f.family.replace(/["']/g, "") === fam);
  if (!declared && !document.querySelector("link[data-pixel-kit]")) {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = new URL("../stage.css", import.meta.url).href;
    l.dataset.pixelKit = "1";
    document.head.append(l);
  }
  const sample = "Розіграш Ґєїі ыэъё ABC 123";
  fontReady = (declared ? Promise.resolve() : new Promise((r) => setTimeout(r, 300)))
    .then(() => Promise.all([document.fonts.load(font(32, 400), sample), document.fonts.load(font(32, 700), sample)]))
    .catch(() => {});
  return fontReady;
}

export function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export const snap = (v, p = PX) => Math.round(v / p) * p;

export function loadImage(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  return img;
}
export const ready = (img) => !!(img && img.complete && img.naturalWidth);

/** A full-screen scene picture of the overlays (assets/scenes/<name>.webp). */
export const sceneUrl = (name) => common.scene?.(name) ?? new URL(`../assets/scenes/${name}.webp`, import.meta.url).href;
export const spriteUrl = (name) => common.sprite?.(name) ?? new URL(`../assets/sprites/hw/${name}.webp`, import.meta.url).href;

/** Draw an image cover-fit over a box, nearest-neighbour. */
export function cover(g, img, x, y, w, h) {
  if (!ready(img)) return;
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
  const s = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  g.imageSmoothingEnabled = s;
}

// ---------------------------------------------------------------- text

/**
 * Text with a hard pixel outline (ink one step around) and an optional deeper drop (like .intro-name).
 * o: { size, weight, color, align, baseline, ink, drop (colour of the 2nd step), depth (px of the drop), ls }
 */
export function text(g, str, x, y, o = {}) {
  const size = o.size ?? 32, depth = o.depth ?? Math.max(PX, snap(size / 16));
  g.font = font(size, o.weight ?? 700);
  g.textAlign = o.align ?? "left";
  g.textBaseline = o.baseline ?? "middle";
  if ("letterSpacing" in g) g.letterSpacing = `${o.ls ?? 0}px`;
  x = Math.round(x); y = Math.round(y);
  if (o.drop) { g.fillStyle = o.drop; g.fillText(str, x + depth * 2, y + depth * 2); }
  if (o.ink !== false) {
    g.fillStyle = o.ink ?? PAL.ink;
    g.fillText(str, x + depth, y + depth);
    const t = Math.max(2, Math.round(depth / 2));
    g.fillText(str, x - t, y); g.fillText(str, x + t, y); g.fillText(str, x, y - t); g.fillText(str, x, y + t);
  }
  g.fillStyle = o.color ?? PAL.bone;
  g.fillText(str, x, y);
  if ("letterSpacing" in g) g.letterSpacing = "0px";
}

export function measure(g, str, size, weight = 700, ls = 0) {
  g.font = font(size, weight);
  if ("letterSpacing" in g) g.letterSpacing = `${ls}px`;
  const w = g.measureText(str).width;
  if ("letterSpacing" in g) g.letterSpacing = "0px";
  return w;
}

/** The biggest size ≤ size that fits maxW. */
export function fit(g, str, size, maxW, weight = 700, ls = 0) {
  const w = measure(g, str, size, weight, ls);
  return w > maxW ? Math.floor(size * maxW / w) : size;
}

// ---------------------------------------------------------------- frames

/**
 * A pixel box like .px in stage.css: plum fill, a 1-art-pixel ring in `frame`, ink outline with notched
 * corners, a bevel inside and a hard drop below. o: { fill, frame, ink, p (pixel), shadow, bevel }
 */
export function box(g, x, y, w, h, o = {}) {
  const p = o.p ?? PX, fr = o.frame ?? PAL.orange, ink = o.ink ?? PAL.ink;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (o.shadow !== false) { g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x, y + h + p * 2, w, p * 2); }
  // ink outline (2 px out), corners notched
  g.fillStyle = ink;
  g.fillRect(x - p, y - 2 * p, w + 2 * p, p); g.fillRect(x - p, y + h + p, w + 2 * p, p);
  g.fillRect(x - 2 * p, y - p, p, h + 2 * p); g.fillRect(x + w + p, y - p, p, h + 2 * p);
  g.fillRect(x - p, y - p, p, p); g.fillRect(x + w, y - p, p, p); g.fillRect(x - p, y + h, p, p); g.fillRect(x + w, y + h, p, p);
  // frame ring
  g.fillStyle = fr;
  g.fillRect(x, y - p, w, p); g.fillRect(x, y + h, w, p); g.fillRect(x - p, y, p, h); g.fillRect(x + w, y, p, h);
  // body + bevel
  if (o.fill !== null) { g.fillStyle = o.fill ?? PAL.plum; g.fillRect(x, y, w, h); }
  if (o.bevel !== false) {
    g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(x, y, w, p); g.fillRect(x, y, p, h);
    g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x, y + h - p, w, p); g.fillRect(x + w - p, y, p, h);
  }
}

/** A thin pixel ring only (1 art pixel of colour + ink around), for avatars and highlights. */
export function ring(g, x, y, w, h, color, p = PX) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillStyle = PAL.ink;
  g.fillRect(x - p, y - 2 * p, w + 2 * p, p); g.fillRect(x - p, y + h + p, w + 2 * p, p);
  g.fillRect(x - 2 * p, y - p, p, h + 2 * p); g.fillRect(x + w + p, y - p, p, h + 2 * p);
  g.fillStyle = color;
  g.fillRect(x, y - p, w, p); g.fillRect(x, y + h, w, p); g.fillRect(x - p, y, p, h); g.fillRect(x + w, y, p, h);
}

// ---------------------------------------------------------------- glows and shapes

/** Prize name for the screen: leading emoji/stars dropped («⭐ Суперприз: …» → «Суперприз: …»). */
export function prizeLabel(name) {
  return String(name ?? "").replace(/^[^\p{L}\p{N}«"]+/u, "").trim();
}

const glowCache = new Map();
/**
 * A stepped light pool instead of a soft radial glow: 3 hard rings of falling alpha.
 * Returned canvas is tiny; glow() draws it nearest-neighbour.
 */
export function glowSprite(color, levels = [0.55, 0.3, 0.14], n = 48) {
  const key = color + levels.join() + '|' + n;
  let c = glowCache.get(key);
  if (c) return c;
  // n = art pixels across (one sprite pixel = 2 art pixels when drawn by glow())
  c = canvas(n, n);
  const gg = c.getContext("2d");
  const rgb = parseInt(color.slice(1), 16);
  const im = gg.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
    const f = Math.max(0, 1 - d) * 3; // 0..3 → which step
    // hard stepped rings, no dithering (owner: dither textures look like an old TV)
    const lv = Math.min(3, Math.ceil(f));
    if (!lv) continue;
    const i = (y * n + x) * 4;
    im.data[i] = rgb >> 16; im.data[i + 1] = (rgb >> 8) & 255; im.data[i + 2] = rgb & 255;
    im.data[i + 3] = Math.round(255 * levels[3 - lv]);
  }
  gg.putImageData(im, 0, 0);
  glowCache.set(key, c);
  return c;
}
/** A dithered glow of diameter `size` centred at x,y; alpha multiplies. */
export function glow(g, x, y, size, color, alpha = 1) {
  if (alpha <= 0.01 || size < 2) return;
  const s = g.imageSmoothingEnabled, a = g.globalAlpha;
  g.imageSmoothingEnabled = false;
  g.globalAlpha = a * Math.min(1, alpha);
  const n = Math.max(8, Math.min(192, Math.round(size / (PX * 2) / 4) * 4)), d = n * PX * 2;
  g.drawImage(glowSprite(color, undefined, n), snap(x - d / 2), snap(y - d / 2), d, d);
  g.globalAlpha = a;
  g.imageSmoothingEnabled = s;
}

/** A filled pixel disc (art pixels of size p), for embers, moons, eyes. */
export function disc(g, cx, cy, r, color, p = PX) {
  g.fillStyle = color;
  const n = Math.max(1, Math.round(r / p));
  for (let j = -n; j < n; j++) {
    const yy = (j + 0.5) / n, half = Math.round(Math.sqrt(Math.max(0, 1 - yy * yy)) * n);
    if (half > 0) g.fillRect(snap(cx) - half * p, snap(cy) + j * p, half * 2 * p, p);
  }
}

/** A pixel ring (outline circle) of art pixels, radius r, thickness t art pixels. */
export function circle(g, cx, cy, r, color, t = 1, p = PX) {
  g.fillStyle = color;
  const n = Math.max(2, Math.round(r / p)), steps = Math.max(24, n * 7);
  const seen = new Set();
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    for (let k = 0; k < t; k++) {
      const x = Math.round(Math.cos(a) * (n - k)), y = Math.round(Math.sin(a) * (n - k)), key = x * 9999 + y;
      if (seen.has(key)) continue;
      seen.add(key);
      g.fillRect(snap(cx) + x * p, snap(cy) + y * p, p, p);
    }
  }
}

/** A square ember (art pixels). */
export function ember(g, x, y, size, color) {
  const s = Math.max(PX, snap(size));
  g.fillStyle = color;
  g.fillRect(snap(x) - s / 2, snap(y) - s / 2, s, s);
}

// ---------------------------------------------------------------- photos

/**
 * A photo/avatar in a size×size box (cover-fit), drawn smooth: photos stay sharp, only the art around them is
 * pixel art. `p` is kept for the callers' signature. Returns false when the image is not loaded yet.
 */
export function photo(g, img, x, y, size, p = PX) {
  return pixelImage(g, img, x, y, size, size, p);
}

/** Like photo(), for any w×h box (cover-fit). */
export function pixelImage(g, img, x, y, w, h) {
  if (!ready(img)) return false;
  const iw = img.naturalWidth, ih = img.naturalHeight, k = Math.max(w / iw, h / ih);
  const sw = w / k, sh = h / k;
  const s = g.imageSmoothingEnabled, q = g.imageSmoothingQuality;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  try { g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, Math.round(x), Math.round(y), Math.round(w), Math.round(h)); } catch { return false; } finally {
    g.imageSmoothingEnabled = s;
    g.imageSmoothingQuality = q;
  }
  return true;
}

// ---------------------------------------------------------------- prize picture (winner screen)

/**
 * The won prize's picture (prizeOf().picture in screen-kit.js) — starts loading at once and never blocks:
 * visuals draw it when it is ready and simply skip it otherwise. null when the prize has no picture.
 * A set is one drawn scene (3:2), anything else the first product photo (1:1).
 */
export function prizePicture(prize) {
  if (!prize?.picture) return null;
  return { img: loadImage(prize.picture), set: !!prize.set, url: prize.picture };
}

/** Frame size of the picture for a given width of a set (≈360 at 1920×1080); a photo gets a square of 2/3 that. */
export function prizePictureSize(pic, w = 360) {
  const h = snap(w * 2 / 3);
  return pic?.set ? [snap(w), h] : [h, h];
}

/** The picture in a pixel frame (box), top-left at x,y. false — nothing drawn — until the image has loaded. */
export function prizeFrame(g, pic, x, y, w, h, o = {}) {
  if (!pic || !ready(pic.img)) return false;
  box(g, x, y, w, h, { frame: PAL.gold, fill: PAL.ink, bevel: false, ...o });
  return pixelImage(g, pic.img, x, y, w, h);
}

/**
 * The same framed picture as a <canvas> for DOM overlays (class `px-prize-pic`, sized in design pixels,
 * frame margin included). It stays empty and gets `.ready` once the image loads; a failed load leaves it hidden.
 */
export function prizeCanvas(pic, w = 360) {
  if (!pic) return null;
  const [fw, fh] = prizePictureSize(pic, w), m = 3 * PX;
  const c = canvas(fw + 2 * m, fh + 2 * m + 2 * PX);
  c.className = "px-prize-pic";
  c.style.setProperty("--pw", String(c.width)); // design width, for CSS sizing: calc(var(--u) * var(--pw) * 1px)
  c.style.imageRendering = "pixelated";
  const paint = () => {
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    if (prizeFrame(g, pic, m, m, fw, fh, { shadow: false })) c.classList.add("ready");
  };
  if (ready(pic.img)) paint(); else pic.img.addEventListener("load", paint, { once: true });
  return c;
}

// ---------------------------------------------------------------- low-res layer

/**
 * An offscreen layer at 1/p of the design size (1920×1080 → 480×270 for p=4): draw shapes there in
 * design coordinates (the layer's context is pre-scaled), then blit() it up nearest-neighbour. Anything
 * drawn into it — curves, rotations, alpha — comes out as hard art pixels like the scene pictures.
 */
export function lowres(w = 1920, h = 1080, p = PX) {
  const c = canvas(w / p, h / p);
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  return {
    canvas: c, g, p,
    begin() { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(1 / p, 0, 0, 1 / p, 0, 0); g.imageSmoothingEnabled = false; return g; },
    blit(dst, x = 0, y = 0, dw = w, dh = h) { const s = dst.imageSmoothingEnabled; dst.imageSmoothingEnabled = false; dst.drawImage(c, x, y, dw, dh); dst.imageSmoothingEnabled = s; },
  };
}

/** Plural of «квиток» in the scene's language. */
export { ticketsWord } from "../lang.js";
