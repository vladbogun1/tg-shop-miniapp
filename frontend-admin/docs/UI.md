# Aurora design system — component & token reference (admin v2)

You are building a page for a **from-scratch redesign** of the tg-shop admin panel.
The backend contract (`lib/api.ts`) and utility libs are **unchanged** — reuse them as-is.
Build a **premium, modern, animated** UI using the primitives below. Do NOT invent new
global CSS or new color values; use the tokens and components here. Heavy use of
**framer-motion** (staggered entrances, spring drawers/modals, hover lift) is expected.

## Aesthetic
- Clean **solid surfaces** with hairline borders + soft shadows (NOT glassmorphism).
- Dark by default; a light theme is driven by `[data-theme]` — always use the CSS vars below
  (never hard-code hex except inside recharts, which can't read CSS vars).
- Indigo→violet accent. Generous spacing, crisp typography, rounded corners.
- Every list/grid animates in with a stagger; cards lift on hover; modals/drawers spring.
- Always handle: loading (Skeleton/CenterSpinner), empty (EmptyState), and error states.

## CSS tokens (use via `text-[var(--token)]`, `bg-[var(--token)]`, inline style, etc.)
Surfaces: `--bg --bg-2 --surface --surface-2 --surface-3 --surface-hover`
Borders: `--border --border-2 --border-strong`
Text: `--text --text-muted --text-faint`
Accent: `--accent --accent-2 --accent-soft --accent-soft-2 --accent-ink`; gradient `var(--grad-accent)`
Semantic: `--ok --warn --danger --danger-ink --info`
Status: `--st-new --st-approved --st-shipped --st-delivered --st-rejected`
Radius: `--r-sm(10) --r-md(14) --r-lg(20) --r-xl(28) --r-pill`
Shadow: `--shadow-1 --shadow-2 --shadow-3 --shadow-accent`; focus ring `--ring-accent`

## Utility classes (in globals.css)
- `.card` — primary surface (border + radius-lg + shadow-1). `.card-sheen` adds a top edge highlight.
- `.card-2` — secondary surface (surface-2). `.panel` — elevated. `.elevated` — floating (menus/popovers).
- `.accent-fill` — indigo→violet gradient fill (for accents/badges/avatars).
- `.text-gradient` — gradient text. `.thin-scroll` — slim scrollbar. `.shimmer` — skeleton.
- `.focusable` — adds accent focus ring on `:focus-visible`.

## Components (import from `@/components/ui/...` unless noted)
- `Button` — `variant: accent|surface|ghost|outline|danger`, `size: sm|md|lg|icon`, props `loading`, `icon`, `iconRight`. (motion.button; whileTap built in)
- `Input` — `label`, `icon`, `hint`, `error`, `rightSlot`. Standard input props.
- `Textarea` — `label`, `hint`.
- `Toggle` — `checked`, `onChange(v)`, `label`.
- `SegmentedControl<T>` — `options: {value,label,count?}[]`, `value`, `onChange`, `size`. Animated active pill (great for filter chips / tabs).
- `Select<T>` — `label`, `value`, `options:{value,label}[]`, `onChange`, `placeholder`. Portal dropdown.
- `Autocomplete<T>` — `label`, `selectedLabel`, `fetchItems(q)=>Promise<T[]>`, `itemLabel`, `itemSubLabel?`, `itemKey`, `onSelect`, `onClear?`. Portal dropdown.
- `Badge` — `tone: neutral|accent|ok|warn|danger|info`, `dot?`. `StatusBadge` — `status: OrderStatus` (auto color+label).
- `Modal` — `open`, `onClose`, `title?`, `footer?`, `size: sm|md|lg`. Portal + spring.
- `Drawer` — `open`, `onClose`, `title?`/`header?`, `width?` (e.g. `"max-w-2xl"`), `zClass?` (stack drawers, e.g. `"z-[140]"`). Right-side, portal + spring.
- `Lightbox` — `src`, `onClose`, `originalHref?`.
- `Skeleton` / `SkeletonText` — loading placeholders.
- `Spinner` / `CenterSpinner` (`{label?}`) — from `@/components/ui/Spinner`.
- `EmptyState` — `icon?` (lucide), `title`, `description?`, `action?`.
- `StatCard` — `label`, `rawValue` (number → animated count-up) OR `value` (string), `format?`, `icon?` (lucide), `accent?` (css color), `hint?`.
- `CountUp` — `value`, `format?` — animated number.
- `PageHeader` (from `@/components/layout/PageHeader`) — `title`, `subtitle?`, `actions?`. Use at top of every page.

## Motion presets (`@/lib/motion`)
`pageVariants, staggerContainer, riseItem, modalVariants, drawerVariants, backdropVariants, hoverLift, spring, springSoft, ease`.
Typical list: wrap container in `motion.div variants={staggerContainer} initial="initial" animate="animate"`, each item `motion.div variants={riseItem}`.

## Utilities
- `money(minor, currency?)` from `@/lib/money`; `toMinor`, `toMajor`.
- Orders: `@/lib/orders` → `STATUS_ORDER, STATUS_LABEL, STATUS_EMOJI, STATUS_VAR, canTransition, allowedTargets, DELIVERY_LABEL, shortId, timeAgo, formatDateTime`.
- Range: `@/lib/range` → `RANGE_OPTIONS, useTimeRange()` (returns `[range, setRange]`).
- Images: `@/lib/image` → `Image` component (`src`/`imageKey`, `alt`, `size`, `className`), `resolveImageSrc`, `resolveImageFull`.
- Metrics fmt: `@/lib/metrics-format` → `shortDate, moneyShort, hoursLabel, CHART_COLORS, STATUS_COLOR, SERIES_PALETTE`.
- Toast: `@/lib/toast` → `useToast()` → `push(text, "ok"|"error"|"info")`.
- API: `@/lib/api` → `adminApi.*` (see file), types, `ApiError`. WebSocket chat: `@/lib/ws` → `subscribeOrderChat(orderId, cb)`.
- `cn(...)` from `@/lib/cn`.

## Rules
- `"use client"` at top of every interactive file.
- Preserve ALL functionality of the original page (read it first) — same API calls, same features. Only the LOOK changes.
- Reuse existing query keys where the original used them (e.g. `["board"]`, `["admin","unread-count"]`) so cross-invalidation keeps working.
- TypeScript must be clean (no `any` leaks, no unused imports).
