// Rasterizes the ChiSetup brand SVGs (made by gen_brand.py) with Playwright from the repo's
// node_modules. Run from the repo root: `node docs/brand/v3/tools/render_brand.mjs`
//   docs/brand/v3/bot-avatar.png     640x640  CS mark, full bleed (Telegram crops it to a circle)
//   site/app/apple-icon.png          180x180  CS mark, full bleed (iOS rounds it itself)
//   docs/brand/v3/miniapp-cover.png  640x360  logo-full on the dark "banner" background (BotFather)
//   site/public/og-image.png        1200x630  same cover, default og:image of the website
//   site/public/logo.png             512x512  CS mark, schema.org Organization logo
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const { chromium } = await import(pathToFileURL(path.join(root, "node_modules/playwright/index.mjs")).href);

const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const markBleed = read("docs/brand/v3/tools/mark-full-bleed.svg");
const logoFull = read("docs/brand/v3/logo-full.svg");

const page = (body, w, h) => `<!doctype html><html><head><style>
html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0E0E10}
svg{display:block}
</style></head><body>${body}</body></html>`;

const sized = (svg, w, h) => svg.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`);

// Banner background after reference/banner.webp: graphite, faint HUD grid + frame lines,
// glowing orange diagonal streaks in the top-left and bottom-right, darker diagonal panels.
const cover = (w, h) => {
  const logoW = Math.round(w * 0.66);
  return `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;
  background:radial-gradient(ellipse 55% 45% at 50% 50%,rgba(255,102,0,.10),transparent 70%),#0C0C0E">
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:32px 32px;-webkit-mask-image:radial-gradient(ellipse at center,transparent 25%,#000 80%)"></div>
  <div style="position:absolute;inset:0;background:
    linear-gradient(135deg,#141416 0 14%,transparent 14.2%),
    linear-gradient(315deg,#141416 0 14%,transparent 14.2%)"></div>
  <div style="position:absolute;inset:0;filter:drop-shadow(0 0 6px rgba(255,102,0,.9)) drop-shadow(0 0 14px rgba(255,102,0,.45));background:
    linear-gradient(135deg,transparent calc(11% - 1px),#FF7A1F 11%,transparent calc(11% + 1.5px)),
    linear-gradient(135deg,transparent calc(16% - 1px),rgba(255,102,0,.7) 16%,transparent calc(16% + 1px)),
    linear-gradient(135deg,transparent calc(89% - 1.5px),#FF7A1F 89%,transparent calc(89% + 1px)),
    linear-gradient(135deg,transparent calc(84% - 1px),rgba(255,102,0,.7) 84%,transparent calc(84% + 1px));
    -webkit-mask-image:radial-gradient(circle at 0 0,#000 0,transparent 42%),radial-gradient(circle at 100% 100%,#000 0,transparent 42%)"></div>
  <div style="position:absolute;left:8%;right:8%;top:9%;height:1px;background:rgba(255,255,255,.06)"></div>
  <div style="position:absolute;left:8%;right:8%;bottom:9%;height:1px;background:rgba(255,255,255,.06)"></div>
  <div style="position:absolute;left:44%;top:calc(9% - 1px);width:24px;height:2px;background:#FF6600;box-shadow:0 0 6px #FF6600"></div>
  <div style="position:absolute;right:44%;bottom:calc(9% - 1px);width:24px;height:2px;background:#FF6600;box-shadow:0 0 6px #FF6600"></div>
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);filter:drop-shadow(0 0 18px rgba(255,102,0,.18))">${sized(logoFull, logoW, Math.round((logoW * 335) / 1071))}</div>
</div>`;
};

const jobs = [
  { out: "docs/brand/v3/bot-avatar.png", w: 640, h: 640, html: sized(markBleed, 640, 640) },
  { out: "site/app/apple-icon.png", w: 180, h: 180, html: sized(markBleed, 180, 180) },
  { out: "docs/brand/v3/miniapp-cover.png", w: 640, h: 360, html: cover(640, 360) },
  // Website: default share picture (og:image / twitter:image) and the schema.org logo.
  { out: "site/public/og-image.png", w: 1200, h: 630, html: cover(1200, 630) },
  { out: "site/public/logo.png", w: 512, h: 512, html: sized(markBleed, 512, 512) },
];

const browser = await chromium.launch();
for (const j of jobs) {
  const p = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
  await p.setContent(page(j.html, j.w, j.h));
  await p.screenshot({ path: path.join(root, j.out), clip: { x: 0, y: 0, width: j.w, height: j.h } });
  await p.close();
  console.log("wrote", j.out);
}
await browser.close();
