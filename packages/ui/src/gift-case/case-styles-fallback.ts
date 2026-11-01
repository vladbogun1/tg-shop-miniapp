/**
 * The case UI paints with `color-mix(in srgb, var(--ga|--ga2|--rc) N%, …)`; iOS 15.4–16.1 (Safari < 16.2)
 * drops such a declaration and the glow / badge / ticket would stay bare. `CASE_CSS_FALLBACK` is every rule
 * of CASE_CSS that has one, with the mix rewritten as `rgb(var(--x-rgb) / N%)` (the `--x-rgb` twins are set
 * next to `--x` by caseTierVars / rarityVars), wrapped in `@supports not (color-mix)` — modern browsers
 * ignore it. A mix with white/black becomes a plain tint of the colour: close enough for a decorative glow.
 * See docs/BROWSER-SUPPORT.md.
 */
import { CASE_CSS } from "./case-styles";

const MIX = new RegExp(
  "color-mix[(]in srgb,var[(](--[a-z0-9]+)(?:,(#[0-9a-fA-F]{6}))?[)] ([0-9.]+)%,(?:[^,()]|[(][^)]*[)])*[)]",
  "g",
);

function hexChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function rewriteMix(css: string): string {
  return css.replace(MIX, (_m, v: string, def: string | undefined, pct: string) => {
    const fallback = def ? `,${hexChannels(def)}` : "";
    return `rgb(var(${v}-rgb${fallback}) / ${Number(pct)}%)`;
  });
}

/** Rules (recursing into @media / @keyframes) that contain color-mix, rewritten; "" when none. */
export function mixFallbackRules(css: string): string {
  let out = "";
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      if (depth === 0) open = i;
      depth++;
    } else if (c === "}" && --depth === 0) {
      const prelude = css.slice(start, open).trim();
      const body = css.slice(open + 1, i);
      if (body.includes("color-mix(")) {
        out += prelude.startsWith("@")
          ? `${prelude}{${mixFallbackRules(body)}}`
          : `${prelude}{${rewriteMix(body)}}`;
      }
      start = i + 1;
    }
  }
  return out;
}

export const CASE_CSS_FALLBACK = `@supports not (color:color-mix(in srgb,red 50%,blue)){${mixFallbackRules(CASE_CSS)}}`;
