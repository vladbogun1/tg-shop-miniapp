#!/usr/bin/env node
/**
 * Browser-compatibility gate for the customer bundles (site + Mini App). Scans the BUILT chunks
 * (`<app>/.next/static/chunks/**.js`) — our code, @shop/core, @shop/ui and every dependency as they really
 * ship — for syntax and APIs the supported browsers do not have. See docs/BROWSER-SUPPORT.md.
 *
 *   node scripts/check-browser-compat.mjs site frontend     # after `next build`; exit 1 on findings
 *
 * Why built chunks and not the sources: SWC transpiles syntax down to the browserslist target but
 * never touches regular expressions or runtime APIs, and Next's polyfills chunk is `nomodule`, so
 * modern-but-not-modern-enough Safari (iOS 15/16) gets no polyfills at all. 25.10.2026 a lookbehind
 * in packages/core/src/product-brand.ts killed the whole site and Mini App on iOS < 16.4.
 *
 * A finding next to a feature test (`typeof X.y` / `"y" in X` within ~80 chars before it) is
 * treated as guarded and not reported.
 */
import fs from "node:fs";
import path from "node:path";

// Minimum: iOS Safari 15.4, Chrome/Android WebView 92. Each rule: what it is, the first Safari
// that has it, and a pattern over minified code.
const RULES = [
  { id: "regexp-lookbehind", safari: "16.4", re: /\(\?<[=!]/g, why: "SyntaxError in RegExp — the whole chunk dies" },
  { id: "regexp-v-flag", safari: "17", re: /new RegExp\([^)]*,\s*["'`][a-z]*v[a-z]*["'`]\)|\/[a-z]*v[a-z]*\.test\(/g, why: "unicodeSets flag" },
  { id: "class-static-block", safari: "16.4", re: /\bstatic\s*\{/g, why: "SyntaxError" },
  { id: "array-change-by-copy", safari: "16", re: /\.(toSorted|toReversed|toSpliced)\(/g, why: "use [...a].sort()" },
  { id: "group-by", safari: "17.4", re: /\b(Object|Map)\.groupBy\b/g, why: "use reduce()" },
  { id: "promise-with-resolvers", safari: "17.4", re: /Promise\.withResolvers\b/g, why: "use new Promise" },
  { id: "array-from-async", safari: "16.4", re: /Array\.fromAsync\b/g, why: "use Promise.all" },
  { id: "set-methods", safari: "17", re: /\.(union|intersection|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/g, why: "use loops" },
  { id: "string-well-formed", safari: "16.4", re: /\.(isWellFormed|toWellFormed)\(/g, why: "" },
  { id: "iterator-helpers", safari: "18.4", re: /\bIterator\.from\b/g, why: "" },
];

const SKIP_FILE = /(^|[\\/])polyfills-[^\\/]*\.js$/; // Next's own nomodule polyfills
const GUARD = /typeof\s+[\w$.]+|["'][\w$]+["']\s+in\s+[\w$.]+|\?\.\s*$/;

function walk(dir, out = [], ext = ".js") {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, ext);
    else if (e.name.endsWith(ext) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

// ── CSS: `color-mix()` needs Safari 16.2; below that the whole declaration is dropped and a status block
// stays unpainted (P2-13). Every one in the built CSS must have a precomputed fallback before it
// (packages/ui/postcss/color-mix-fallback.cjs adds them; Tailwind wraps arbitrary utilities in
// `@supports (color:color-mix(…))`, there the fallback is a same-selector rule before the @supports).

/** Minimal tree of minified CSS: { prelude, body, children } — children only for blocks holding rules. */
function parseCss(css) {
  const nodes = [];
  let depth = 0, start = 0, open = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth++ === 0) open = i;
    } else if (c === "}" && --depth === 0) {
      const prelude = css.slice(start, open).trim();
      const body = css.slice(open + 1, i);
      nodes.push({ prelude, body, children: body.includes("{") ? parseCss(body) : null });
      start = i + 1;
    }
  }
  return nodes;
}

function splitDecls(body) {
  const out = [];
  let depth = 0, cur = "";
  for (const c of body) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((d) => {
    const at = d.indexOf(":");
    return { prop: d.slice(0, at).trim(), value: d.slice(at + 1) };
  });
}

function cssMixFindings(nodes, file, guarded = false, out = []) {
  nodes.forEach((n, k) => {
    if (n.children) {
      const sup = /^@supports.*color-mix/.test(n.prelude);
      cssMixFindings(n.children, file, guarded || sup, out);
      if (sup) {
        for (const r of n.children) {
          if (!r.body.includes("color-mix(")) continue;
          const hasFallback = nodes.slice(0, k).some((p) => p.prelude === r.prelude && !p.body.includes("color-mix("));
          if (!hasFallback) out.push({ file, where: r.prelude, prop: "(inside @supports color-mix)" });
        }
      }
      return;
    }
    if (guarded || !n.body.includes("color-mix(")) return;
    const decls = splitDecls(n.body);
    decls.forEach((d, i) => {
      if (!d.value.includes("color-mix(")) return;
      if (!decls.slice(0, i).some((p) => p.prop === d.prop && !p.value.includes("color-mix("))) {
        out.push({ file, where: n.prelude, prop: d.prop });
      }
    });
  });
  return out;
}

/** `--x-rgb: r g b` twins (tint() in @shop/ui/tint) must equal the `--x: #rrggbb` they shadow. */
function twinFindings(app) {
  const file = path.join(app, "app", "globals.css");
  if (!fs.existsSync(file)) return [];
  const css = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of css.matchAll(/--([\w-]+)-rgb:\s*(\d+) (\d+) (\d+)\s*;/g)) {
    const hex = new RegExp(`--${m[1]}:\\s*#([0-9a-fA-F]{6})`).exec(css);
    const n = hex ? parseInt(hex[1], 16) : -1;
    const want = `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
    if (!hex || want !== `${m[2]} ${m[3]} ${m[4]}`) out.push({ file, where: `--${m[1]}-rgb`, prop: `is ${m[2]} ${m[3]} ${m[4]}, --${m[1]} says ${hex ? want : "(no hex)"}` });
  }
  return out;
}

const apps = process.argv.slice(2);
if (!apps.length) {
  console.error("usage: node scripts/check-browser-compat.mjs <app-dir>... (e.g. site frontend)");
  process.exit(2);
}

let findings = 0;
for (const app of apps) {
  const chunks = path.join(app, ".next", "static", "chunks");
  const files = walk(chunks);
  if (!files.length) {
    console.error(`✖ ${app}: no built chunks in ${chunks} — run \`next build\` first`);
    process.exit(2);
  }
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const rule of RULES) {
      for (const m of src.matchAll(rule.re)) {
        const before = src.slice(Math.max(0, m.index - 80), m.index);
        if (rule.id !== "regexp-lookbehind" && GUARD.test(before)) continue;
        findings++;
        const ctx = src.slice(Math.max(0, m.index - 70), m.index + 50).replace(/\s+/g, " ");
        console.log(`✖ ${rule.id} (Safari ${rule.safari}+) ${path.relative(".", file)}\n    …${ctx}…${rule.why ? `\n    → ${rule.why}` : ""}`);
      }
    }
  }
  // color-mix in JS = inline styles / CSS-in-JS strings (class names spell it `color-mix(in_srgb`, no space).
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (src.includes("@supports not (color:color-mix")) continue; // the case UI ships its own fallback block
    for (const m of src.matchAll(/color-mix\(in[ ]/g)) {
      findings++;
      console.log(`✖ color-mix-in-js (Safari 16.2+) ${path.relative(".", file)}\n    …${src.slice(Math.max(0, m.index - 50), m.index + 60)}…\n    → use tint()/tintOver() from @shop/ui/tint`);
    }
  }
  const cssFiles = walk(path.join(app, ".next", "static", "css"), [], ".css");
  for (const file of cssFiles) {
    for (const f of cssMixFindings(parseCss(fs.readFileSync(file, "utf8")), file)) {
      findings++;
      console.log(`✖ css-color-mix-no-fallback (Safari 16.2+) ${path.relative(".", f.file)}\n    ${f.where} { ${f.prop} }\n    → postcss color-mix-fallback must precede it`);
    }
  }
  for (const f of twinFindings(app)) {
    findings++;
    console.log(`✖ rgb-twin-drift ${f.file}: ${f.where} ${f.prop}`);
  }
  console.log(`${app}: ${files.length} JS chunks, ${cssFiles.length} CSS files checked`);
}

if (findings) {
  console.log(`\n${findings} finding(s). Supported browsers and fallbacks: docs/BROWSER-SUPPORT.md`);
  process.exit(1);
}
console.log("browser compat: OK");
