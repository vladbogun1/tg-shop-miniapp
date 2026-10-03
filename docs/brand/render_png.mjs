// Renders the brand SVGs (text already outlined by build_brand.py) to PNG with sharp/librsvg.
//   node docs/brand/render_png.mjs
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp"); // hoisted in the workspace root node_modules (Next dependency)
const here = dirname(fileURLToPath(import.meta.url));

const jobs = [
  ["bot-avatar.svg", "bot-avatar.png", 640, 640],
  ["bot-avatar-alt.svg", "bot-avatar-alt.png", 640, 640],
  ["miniapp-cover-640x360.svg", "miniapp-cover-640x360.png", 640, 360],
];
for (const [src, dst, w, h] of jobs) {
  // density 288 = 4x oversampling, then downscale -> clean anti-aliased edges
  await sharp(join(here, src), { density: 288 })
    .resize(w, h)
    .flatten({ background: "#F4F1E6" })
    .png({ compressionLevel: 9 })
    .toFile(join(here, dst));
  console.log("wrote", dst);
}
