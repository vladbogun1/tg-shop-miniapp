// PWA / home-screen icons of the admin, generated from the brand monogram (docs/brand/icon-64.svg:
// ink plate, cream «M», orange «S», hard orange shadow).
//   node frontend-admin/scripts/build-pwa-icons.mjs
// Writes frontend-admin/public/icons/*.png and frontend-admin/app/icon.svg (the tab favicon).
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp"); // hoisted in the workspace root node_modules (Next dependency)

const here = dirname(fileURLToPath(import.meta.url));
const admin = join(here, "..");
const brand = readFileSync(join(admin, "..", "docs", "brand", "icon-64.svg"), "utf8");
// Inner markup of the 64×64 monogram (plate content spans 4…62).
const inner = brand.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>.*?<\/title>/, "");

const CREAM = "#F4F1E6";

/**
 * A square canvas with the monogram centred. `scale` = share of the canvas the 58-unit plate
 * (with its shadow) takes: ~0.78 for a plain icon, ~0.56 for maskable (Android crops to a circle
 * of 80 % — the plate's corners must stay inside it).
 */
function iconSvg(size, scale, bg = CREAM, label = "") {
  const k = (size * scale) / 58;
  const offset = (size - 58 * k) / 2 - 4 * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${bg}"/>
${label}
<g transform="translate(${offset.toFixed(2)} ${offset.toFixed(2)}) scale(${k.toFixed(4)})">${inner}</g>
</svg>`;
}

async function png(svg, file, size) {
  await sharp(Buffer.from(svg), { density: 288 })
    .resize(size, size)
    .flatten({ background: CREAM })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log("wrote", file);
}

const out = join(admin, "public", "icons");
mkdirSync(out, { recursive: true });

const jobs = [
  // purpose "any": Chrome install dialog, desktop, Windows/macOS app icon
  ["icon-192.png", 192, 0.78],
  ["icon-512.png", 512, 0.78],
  // purpose "maskable": Android launcher (circle / squircle crop)
  ["icon-maskable-192.png", 192, 0.56],
  ["icon-maskable-512.png", 512, 0.56],
  // iOS home screen: iOS rounds the corners itself and never shows transparency
  ["apple-touch-icon-180.png", 180, 0.7],
];
for (const [name, size, scale] of jobs) {
  await png(iconSvg(size, scale), join(out, name), size);
}

// Android status-bar badge: white «MS» silhouette on transparent — Android paints only alpha.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 64 64">
<g fill="#fff">${inner.replace(/<rect[^>]*\/>/g, "").replace(/fill="#[0-9A-Fa-f]{6}"/g, "")}</g></svg>`;
await sharp(Buffer.from(badgeSvg), { density: 288 }).resize(96, 96).png().toFile(join(out, "badge-96.png"));
console.log("wrote badge-96.png");

// Tab favicon (Next app router serves app/icon.svg as <link rel="icon">).
writeFileSync(join(admin, "app", "icon.svg"), brand);
console.log("wrote app/icon.svg");

// Offline page logo source: same favicon, referenced from public/offline.html.
writeFileSync(join(out, "icon.svg"), brand);
