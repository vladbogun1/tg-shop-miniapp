/**
 * A translucent tint of a status colour for inline `style`s, WITHOUT `color-mix()` (Safari < 16.2 drops
 * the whole declaration, so a status block stays unpainted — docs/BROWSER-SUPPORT.md). Works on the
 * colour tokens that have an `--<name>-rgb` channel twin in globals.css (`var(--ok)` → `var(--ok-rgb)`),
 * and on plain `#rrggbb` colours. Result is pixel-identical to `color-mix(in srgb, c p%, transparent)`.
 */
function channels(color: string): string {
  const token = /^var\((--[\w-]+)\)$/.exec(color);
  if (token) return `var(${token[1]}-rgb)`;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
  }
  throw new Error(`tint(): unsupported colour "${color}" (use a token with an -rgb twin or #rrggbb)`);
}

/** `rgb(c / pct%)` — for `background`, `border-color`, `box-shadow` colours. */
export function tint(color: string, pct: number): string {
  return `rgb(${channels(color)} / ${pct}%)`;
}

/** `background` value: the tint laid over an opaque base (≡ `color-mix(in srgb, c pct%, base)` for an opaque base). */
export function tintOver(color: string, pct: number, base: string): string {
  const t = tint(color, pct);
  return `linear-gradient(${t}, ${t}), ${base}`;
}

/** `r g b` channels of `#rrggbb`, for the `--x-rgb` twin of a runtime colour variable. */
export function hexChannels(hex: string): string {
  return channels(hex);
}
