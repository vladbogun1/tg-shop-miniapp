# Aurora Glass — customer Mini App v2 redesign guide

You are redesigning a surface of the tg-shop **customer Telegram Mini App** (mobile-first,
centered max-width 480px). Goal: **best-in-class mobile UX** (thumb-friendly, clear hierarchy,
obvious primary actions, smooth motion) with a **more pronounced glassmorphism** look.
The backend contract (`lib/api.ts`), cart store (`lib/cart.ts`), and utilities are UNCHANGED —
reuse them. Only the presentation/composition changes; preserve all functionality.

## Aesthetic — pushed glassmorphism
- Highly **translucent frosted panels** (`.glass` / `.glass--strong`) floating over a living,
  colorful **aurora scene** (already in layout via `.scene`). Real backdrop blur does the work.
- Layered depth: cards `.glass`, sheets/navbars/overlays `.glass--strong`, primary CTAs `.glossy`
  (indigo→violet gradient). Generous radii (`--r-md`/`--r-lg`), soft shadows.
- Everything animates: lists stagger in, cards press/scale on tap, sheets/overlays spring,
  the active tab morphs (layoutId). Use framer-motion.
- Mobile UX rules: primary action is a **sticky glass bottom bar** within thumb reach; ≥44px tap
  targets (`.tap`); sticky search/filters at top; bottom-sheets for pickers; skeletons while loading;
  friendly empty/error states; haptic on key taps (`haptic()` from `@/lib/telegram`).

## Tokens (use `text-[var(--token)]`, `bg-[var(--token)]`, inline style)
Glass: `--glass-bg --glass-bg-strong --glass-sheen --glass-stroke --glass-stroke-top --glass-stroke-bottom --glass-blur`
Accent: `--accent --accent-2 --accent-ink`; gradient `var(--grad-accent)`; `.text-gradient`
Text: `--text --text-muted --text-faint`. Semantic: `--ok --warn --danger`.
Radius: `--r-sm(14) --r-md(20) --r-lg(28) --r-xl(34) --r-pill`. Shadow: `--shadow-1 --shadow-2 --shadow-accent`.
Safe area: `--safe-top --safe-bottom`. Classes: `.glass .glass--strong .glass--floating .glass--noise .glossy .glass-press .shimmer .tap .no-scrollbar .text-gradient`.

## UI primitives (`@/components/ui/...`, keep their APIs)
- `GlassButton` — `variant: glass|accent|ghost`, `size: sm|md`, `loading`, `icon`, `fullWidth`.
- `GlassInput` — `label` (floating), `status?: ok|danger`, `hint?`. Standard input props (no `placeholder`).
- `GlassChip` — `children`, `active`, `onClick`, `icon?`.
- `QtyStepper` — `value`, `onChange(n)`, `min?`, `max?`, `size?`.
- `RadioCard` — `selected`, `onSelect`, `title`, `subtitle?`, `icon?`, `right?`.
- `StatusChip` — `status: OrderStatus`.
- `Toast` — `message: string|null`.
- `GlassAutocomplete<T>` — `label`, `selectedLabel`, `fetchItems(q)`, `itemLabel`, `itemSubLabel?`, `itemKey`, `onSelect`, `onClear?`, `status?`.
You MAY add new local components, but reuse these where they fit.

## Utilities
- `money(minor, currency?)` from `@/lib/money`.
- `@/lib/format` → `formatDate, formatDateTime, formatTime, dayLabel, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, ORDER_TIMELINE, shortOrderId`.
- `@/lib/phone` → `formatPhone, phoneE164, isvalidPhone`.
- `@/lib/cart` → `useCart, useCartCount, useCartSubtotal, lineKey, CartLine`.
- `@/lib/api` → `customerApi.*`, `apiGet/apiPost`, types, `ApiError`. WS chat: `@/lib/ws`.
- `@/lib/image` → `Image` component (`src`/`imageKey`, `alt`, `size`, `className`), `resolveImageSrc`, `resolveImageFull`.
- `@/lib/telegram` → `useMainButton` (no-op, keep calls), `haptic()`, deep-link helpers.
- `@/lib/motion` → `spring, springSoft, staggerContainer, riseItem, sheetVariants, overlayRise, backdrop`.
- `cn(...)` from `@/lib/cn`.

## Rules
- `"use client"` at top of interactive files.
- Preserve ALL behavior of the original file (READ it first in `../frontend/<same path>`): same API calls,
  cart logic, query keys, deep-links, WS subscriptions, fullscreen/safe-area handling.
- Keep TabBar bottom padding in mind: page content already gets `padding-bottom: calc(96px + safe)` from layout;
  sticky bottom bars should sit above the TabBar (e.g. `bottom: calc(84px + var(--safe-bottom))`) OR replace it contextually.
- Clean TypeScript (no unused imports, no `any` leaks). Match `lib/api.ts` field names exactly.
- Do NOT run npm/tsc/dev/build. Do NOT edit `lib/`, `components/ui/`, `app/layout.tsx`, `app/globals.css`, or `components/TabBar.tsx` (owned by parent).
