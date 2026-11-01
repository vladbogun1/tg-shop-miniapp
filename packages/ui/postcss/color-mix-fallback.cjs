/**
 * PostCSS plugin: for every `color-mix(in srgb, A p%, B [q%])` in the final CSS it inserts, right before
 * the declaration, the same declaration with the mix precomputed into rgb()/rgba(). Browsers with
 * `color-mix` (Safari 16.2+, Chrome 111+) read the later line and get exactly the original colour; older
 * ones (iOS 15.4–16.1) drop the unknown value and keep the precomputed one. Custom properties (`--ok`
 * …) are resolved from the same stylesheet, so there is one source of truth. An unresolvable colour
 * (e.g. a runtime-only var) fails the build: add a fallback by hand instead of silently shipping none.
 * See docs/BROWSER-SUPPORT.md.
 */

const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };

function parseHex(digits, raw) {
  const h = digits.length === 3 || digits.length === 4 ? [...digits].map((c) => c + c).join("") : digits;
  if (h.length !== 6 && h.length !== 8) throw new Error(`color-mix fallback: bad hex "${raw}"`);
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

function parseColor(raw, vars, depth = 0) {
  const s = raw.trim();
  if (depth > 8) throw new Error(`color-mix fallback: var() cycle at "${raw}"`);
  const v = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(s);
  if (v) {
    const val = vars.get(v[1]) ?? v[2];
    if (val === undefined) throw new Error(`color-mix fallback: ${v[1]} is not defined in the stylesheet`);
    return parseColor(val, vars, depth + 1);
  }
  const lower = s.toLowerCase();
  if (NAMED[lower]) return NAMED[lower];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (hex) return parseHex(hex[1], raw);
  const fn = /^rgba?\(([^)]+)\)$/i.exec(s);
  const p = fn ? fn[1].split(/[\s,/]+/).filter(Boolean).map(Number) : [];
  if (p.length >= 3 && p.every((x) => !Number.isNaN(x))) return [p[0], p[1], p[2], p[3] ?? 1];
  throw new Error(`color-mix fallback: cannot resolve colour "${raw}"`);
}

/** `color-mix(in srgb, …)` args → rgb string. Premultiplied interpolation, as in the CSS spec. */
function mix(args, vars) {
  const parts = splitTop(args);
  const space = /^in\s+([a-z]+)$/i.exec(parts[0].trim());
  if (!space || parts.length !== 3) throw new Error(`color-mix fallback: cannot parse: ${args}`);
  const item = (str) => {
    const m = /^([\s\S]*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(str.trim());
    return { color: parseColor(m[1], vars), pct: m[2] === undefined ? null : Number(m[2]) };
  };
  const a = item(parts[1]);
  const b = item(parts[2]);
  // Against transparent only alpha scales and the hue stays, in every colour space: oklab/lab ≡ srgb there.
  if (space[1].toLowerCase() !== "srgb" && a.color[3] !== 0 && b.color[3] !== 0) {
    throw new Error(`color-mix fallback: only "in srgb" (or any space against transparent) is supported: ${args}`);
  }
  let pa = a.pct, pb = b.pct;
  if (pa === null && pb === null) pa = pb = 50;
  else if (pa === null) pa = 100 - pb;
  else if (pb === null) pb = 100 - pa;
  const sum = pa + pb;
  const wa = pa / sum, wb = pb / sum;
  const alpha = (a.color[3] * wa + b.color[3] * wb) * Math.min(1, sum * 0.01);
  const mixedA = a.color[3] * wa + b.color[3] * wb;
  const ch = (i) => Math.round(mixedA === 0 ? 0 : (a.color[i] * a.color[3] * wa + b.color[i] * b.color[3] * wb) / mixedA);
  const al = Math.round(alpha * 1000) / 1000;
  return al === 1 ? `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})` : `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${al})`;
}

function splitTop(s) {
  const out = [];
  let depth = 0, cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Replace every color-mix(...) in a value (paren-matched, so gradients with several are fine). */
function replaceAll(value, vars) {
  let out = "", i = 0;
  for (;;) {
    const at = value.indexOf("color-mix(", i);
    if (at < 0) return out + value.slice(i);
    out += value.slice(i, at);
    let depth = 0, j = at + "color-mix".length;
    for (; j < value.length; j++) {
      if (value[j] === "(") depth++;
      else if (value[j] === ")" && --depth === 0) break;
    }
    out += mix(value.slice(at + "color-mix(".length, j), vars);
    i = j + 1;
  }
}

/** Nearest enclosing `@supports (… color-mix …)` — Tailwind v4 wraps every arbitrary color-mix utility in one. */
const supportsAncestor = (node) => {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === "atrule" && p.name === "supports" && /color-mix/.test(p.params)) return p;
  }
  return null;
};

/** Tailwind already put a plain-colour rule (same selector, same props) before the @supports block. */
function hasPlainTwin(rule) {
  const props = new Set();
  rule.walkDecls((d) => { if (d.value.includes("color-mix(")) props.add(d.prop); });
  for (let n = rule.parent.prev(); n; n = n.prev()) {
    if (n.type !== "rule" || n.selector !== rule.selector) continue;
    const have = new Set();
    n.walkDecls((d) => { if (!d.value.includes("color-mix(")) have.add(d.prop); });
    if ([...props].every((x) => have.has(x))) return true;
  }
  return false;
}

function colorMixFallback() {
  return {
    postcssPlugin: "color-mix-fallback",
    OnceExit(root) {
      const vars = new Map();
      root.walkDecls(/^--/, (d) => { if (!d.value.includes("color-mix(")) vars.set(d.prop, d.value); });
      const guarded = new Set();
      root.walkDecls((decl) => {
        if (!decl.value.includes("color-mix(")) return;
        const sup = supportsAncestor(decl);
        if (sup) {
          // Old browsers skip the whole @supports block, so the fallback is a copy of the rule BEFORE it.
          if (decl.parent.type === "rule" && decl.parent.parent === sup) guarded.add(decl.parent);
          return;
        }
        const prev = decl.prev();
        const plain = prev && prev.type === "decl" && prev.prop === decl.prop && !prev.value.includes("color-mix(");
        let fallback;
        try {
          fallback = replaceAll(decl.value, vars);
        } catch (e) {
          if (plain) return; // unresolvable here (currentcolor …): keep the plain line already before it
          throw decl.error(e.message);
        }
        if (prev && prev.type === "decl" && prev.prop === decl.prop && prev.value === fallback) return;
        decl.cloneBefore({ value: fallback });
      });
      for (const rule of guarded) {
        // Tailwind puts only an OPAQUE twin (the first colour, no alpha) before the @supports block — a green chip
        // with green text. Ours goes right after it, with the real alpha. A colour we cannot resolve at build time
        // (currentcolor) keeps Tailwind's twin.
        const copy = rule.clone();
        try {
          copy.walkDecls((d) => { if (d.value.includes("color-mix(")) d.value = replaceAll(d.value, vars); });
        } catch (e) {
          if (hasPlainTwin(rule)) continue;
          throw rule.error(e.message);
        }
        rule.parent.before(copy);
      }
    },
  };
}
colorMixFallback.postcss = true;
module.exports = colorMixFallback;
