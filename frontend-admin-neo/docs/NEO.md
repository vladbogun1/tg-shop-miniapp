# Neo-Brutalism — admin restyle guide

You are restyling part of the tg-shop ADMIN panel from its previous (clean
"Aurora") look to **Neo-Brutalism**, matching the customer shop. Keep ALL
behavior identical (API calls, query keys, dnd-kit, charts, WS, forms,
pagination, sorting). ONLY the visual styling changes. Desktop-first.

## The look
- Thick **ink borders** (3px; 2px on small chips/dividers) on flat surfaces.
- **Hard offset shadows, NO blur**: `box-shadow: 4px 4px 0 var(--shadow)` (5–7px for panels/popovers/drawers). Interactive things "drop into" the shadow on press: add class `nb-press` (already in globals: `active:translate(4px,4px) + shadow none`), or `active:translate-x-[4px] active:translate-y-[4px] active:shadow-none`.
- **Near-sharp corners** everywhere: radii tokens (`--r-sm/md/lg`) are all ~3px now. Don't add large `rounded-*`. Avatars/dots may stay `rounded-full`.
- **Raw bold color**: accent `--accent` (orange), status `--st-*`, yellow `--c3`. Headings/labels/buttons heavy (font-weight 800–900) and frequently UPPERCASE (`uppercase tracking-wide`).
- Background is a flat ink **graph-paper grid** (already via `.aurora` in layout).
- Light by default + dark (greyer, shadows visible) via `[data-theme]` (handled globally). ALWAYS use the CSS vars below so both themes work. Never hardcode hex (except recharts series colors from `lib/metrics-format.ts`, which can't read CSS vars).
- NO gradients, NO blur, NO soft drop-shadows, NO glassmorphism, NO `text-gradient` gradient (it's flat accent now).

## Tokens (names UNCHANGED from before — values are now neo)
Surfaces: `--bg --bg-2 --surface --surface-2 --surface-3 --surface-hover`.
Lines/shadow: `--line` (=ink border color), `--border --border-2 --border-strong` (all = ink), `--shadow` (hard-shadow color).
Text: `--text --text-muted --text-faint`. Accent: `--accent --accent-2 --accent-soft --accent-soft-2 --accent-ink` (accent-ink is DARK #141414 in both themes → dark text on the orange/yellow fills). Yellow: `--c3`.
Semantic: `--ok --warn --danger --danger-ink --info`. Status: `--st-new --st-approved --st-shipped --st-delivered --st-rejected`.
Radius: `--r-sm --r-md --r-lg` (~3px). Shadow presets: `--shadow-1`(4px) `--shadow-2`(5px) `--shadow-3`(7px). Focus: `--ring-accent`.

## Utility classes (globals.css, already neo)
- `.card` (surface + 3px border + 4px shadow), `.card-2` (surface-2 + border), `.panel` (5px shadow), `.elevated` (7px shadow — menus/drawers/popovers), `.hairline` (2px ink), `.card-sheen` (no-op now).
- `.accent-fill` / `.glossy` (flat accent + ink border + hard shadow), `.nb-press` (press-into-shadow), `.shimmer` (skeleton), `.thin-scroll`, `.no-scrollbar`, `.tap`, `.focusable` (focus ring).
- Custom block inline: `rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] shadow-[4px_4px_0_var(--shadow)]`.

## IMPORTANT contrast rule
Text/icons on bright fills (`--accent` orange, `--c3` yellow, and `--st-*` status colors) must be DARK — use `text-[var(--accent-ink)]` (=#141414, dark in both themes). NEVER `text-[var(--text)]` on those (it flips to light in dark mode → unreadable). The yellow `--c3` case is already forced dark globally; you handle accent/status fills.

## Primitives (`@/components/ui/...`) — APIs are FIXED, only restyle
Button (variant accent|surface|ghost|outline|danger, size sm|md|lg|icon, loading, icon, iconRight), Input (label,hint,error,icon,rightSlot), Textarea, Toggle, Badge (tone) + StatusBadge (status), SegmentedControl<T>, Select<T>, Autocomplete<T>, Modal, Drawer, Lightbox, Skeleton/SkeletonText, Spinner/CenterSpinner, EmptyState, StatCard, CountUp. Layout: Shell, ThemeToggle, PageHeader.

## Motion (`@/lib/motion`)
`pageVariants, staggerContainer, riseItem, modalVariants, drawerVariants, backdropVariants, hoverLift, spring`. CAVEAT: don't combine a parent `variants=staggerContainer initial animate` with an inner `<AnimatePresence initial={false}>` of `riseItem` children — children stick at opacity:0. Animate list items directly (initial/animate + delay i*0.04) and keep exit for removal.

## Utilities (unchanged)
`money` (@/lib/money); `@/lib/orders` (STATUS_*, etc.); `@/lib/range` (RANGE_OPTIONS, useTimeRange); `@/lib/image` (Image); `@/lib/metrics-format` (CHART_COLORS/STATUS_COLOR/SERIES_PALETTE — literal hex for recharts); `useToast` (@/lib/toast); `@/lib/api` (adminApi, types, ApiError); `@/lib/ws`; `cn` (@/lib/cn).

## Rules
- `"use client"` on interactive files. Preserve every API call / query key / behavior of the file you restyle (read it first — it currently works).
- Clean TypeScript (no unused imports, no `any`). Match `lib/api.ts` field names exactly.
- Keep `PageHeader` at top of pages. Keep dnd-kit board, recharts, drawers, tables, pagination, filters, sorting fully functional.
