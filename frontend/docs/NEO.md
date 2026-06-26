# Neo-Brutalism — customer Mini App restyle guide

You are restyling a screen of the tg-shop customer Mini App from its current
(glassmorphism) look to **Neo-Brutalism**. Keep ALL behavior identical (API
calls, cart logic, query keys, WS, deep-links, fullscreen/safe-area, sticky
bars) — ONLY the visual styling changes. Mobile-first, centered max-width 480px.

## The look
- Thick **ink borders** (3px, 2.5px on small controls) on a flat surface.
- **Hard offset shadows, NO blur**: `box-shadow: 5px 5px 0 var(--shadow)` (4px on buttons). On press, elements "drop into" the shadow: `active:translate-x-[4px] active:translate-y-[4px] active:shadow-none`.
- **Near-sharp corners**: `rounded-[var(--r)]` (3px). Never large radii, never pills.
- **Raw bold color**: orange accent `--accent`, plus `--c2` blue, `--c3` yellow, `--c4` green, `--c5` pink. Use boldly (price tags in yellow, accents in orange).
- **Heavy type**: weights 800–900, frequent UPPERCASE with `tracking-wide` for labels/headings/buttons. Body 500–600.
- Background is a flat **graph-paper grid** (already in layout via `.scene`) — pages sit on it; cards are solid `--surface`.
- Light by default + dark via `[data-theme]` (handled globally) — ALWAYS use the CSS vars below so both themes work. Never hardcode hex.
- NO glass, NO backdrop-filter, NO gradients, NO soft blur shadows, NO `text-gradient`.

## Tokens (CSS vars)
Surfaces: `--bg --surface --surface-2`. Lines: `--line`. Shadow color: `--shadow`.
Text: `--ink --muted --faint`. Accents: `--accent --accent-ink --c2 --c3 --c4 --c5`.
Semantic: `--ok --warn --danger`. Radius: `--r`. Safe area: `--safe-top --safe-bottom`.

## Helper classes (globals.css)
- `.nb` = surface + 3px border + 5px hard shadow. `.nb-lg` = 7px shadow. `.nb-flat` = border, no shadow.
- `.nb-accent` = accent fill + border + shadow + bold. `.nb-press` = press-into-shadow transition (add to interactive `.nb*`).
- `.nb-chip` / `.nb-chip-active` = chip; `.nb-up` = uppercase+tracking. `.shimmer` = skeleton (bordered). `.tap` = ≥44px.
- Inline pattern for a custom block: `className="rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--surface)] shadow-[5px_5px_0_var(--shadow)]"`.

## Primitives (already neo-styled — reuse, APIs unchanged) `@/components/ui/...`
`GlassButton` (variant glass|accent|ghost, size sm|md, loading, icon, fullWidth),
`GlassInput` (label, status, hint), `GlassChip` (active, icon), `QtyStepper`,
`RadioCard`, `StatusChip`, `Toast`, `GlassAutocomplete`. Also `@/components/catalog/AddToCartControl` is neo.

## Utilities (unchanged)
`money` (@/lib/money); `@/lib/format` (formatDate/Time, dayLabel, ORDER_STATUS_LABEL/COLOR, ORDER_TIMELINE, shortOrderId); `@/lib/phone`; `@/lib/cart`; `@/lib/api` (customerApi, types, ApiError); `@/lib/ws`; `@/lib/image` (Image); `@/lib/telegram` (haptic, useMainButton no-op); `@/lib/motion` (spring, staggerContainer, riseItem, sheetVariants, overlayRise, backdrop); `cn` (@/lib/cn).

## Framer-motion caveat (IMPORTANT)
Do NOT combine a parent `variants={staggerContainer} initial="initial" animate="animate"` with an inner `<AnimatePresence initial={false}>` of `variants={riseItem}` children — children get stuck at opacity:0. For lists that animate items in AND out, animate each item DIRECTLY with `initial/animate` (+ optional `delay: i*0.05`) and keep `exit` for removal; do not rely on variant-label propagation through AnimatePresence.

## Rules
- `"use client"` on interactive files. Preserve every API call / query key / behavior of the file you are restyling (read it first — it currently works in glass).
- Keep sticky bottom bars above the TabBar (`bottom: calc(84px + var(--safe-bottom))`), keep safe-area paddings.
- Clean TypeScript (no unused imports, no `any`). Match `lib/api.ts` field names exactly.
- Do NOT edit `lib/`, `components/ui/`, `app/layout.tsx`, `app/globals.css`, `components/TabBar.tsx`, `components/ThemeToggle.tsx`, or the catalog files (`app/page.tsx`, `components/catalog/*`) — those are done.
