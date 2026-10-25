#!/usr/bin/env node
/**
 * Browser-compatibility gate for the customer bundles (site + Mini App). Scans the BUILT chunks
 * (`<app>/.next/static/chunks/**.js`) — our code, @shop/shared and every dependency as they really
 * ship — for syntax and APIs the supported browsers do not have. See docs/BROWSER-SUPPORT.md.
 *
 *   node scripts/check-browser-compat.mjs site frontend     # after `next build`; exit 1 on findings
 *
 * Why built chunks and not the sources: SWC transpiles syntax down to the browserslist target but
 * never touches regular expressions or runtime APIs, and Next's polyfills chunk is `nomodule`, so
 * modern-but-not-modern-enough Safari (iOS 15/16) gets no polyfills at all. 25.10.2026 a lookbehind
 * in shared/src/product-brand.ts killed the whole site and Mini App on iOS < 16.4.
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

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js") && !SKIP_FILE.test(p)) out.push(p);
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
  console.log(`${app}: ${files.length} chunks checked`);
}

if (findings) {
  console.log(`\n${findings} finding(s). Supported browsers and fallbacks: docs/BROWSER-SUPPORT.md`);
  process.exit(1);
}
console.log("browser compat: OK");
