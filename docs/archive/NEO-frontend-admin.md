# Neo-Brutalism (v2) — superseded

The admin no longer uses the neo-brutalist look (thick ink borders, hard offset shadows, light
theme). Since v3 it follows the ChiSetup dark identity:

- design contract: `docs/DESIGN-V3.md` §8 «Админка (v3)» (+ §2–§5 shared with the shop);
- tokens and primitive classes: `frontend-admin/app/globals.css`;
- screen-conversion checklist and remaining-work inventory: `.devdata/v3/admin/FOUNDATION.md`.

Still valid from the old guide:

## Motion (`@/lib/motion`)
`pageVariants, staggerContainer, riseItem, modalVariants, drawerVariants, backdropVariants, hoverLift, spring`.
CAVEAT: don't combine a parent `variants=staggerContainer initial animate` with an inner
`<AnimatePresence initial={false}>` of `riseItem` children — children stick at opacity:0. Animate list
items directly (initial/animate + delay i*0.04) and keep exit for removal.

## Rules
- `"use client"` on interactive files. Preserve every API call / query key / behaviour of the file you
  restyle (read it first — it currently works).
- Clean TypeScript (no unused imports, no `any`). Match `lib/api.ts` field names exactly.
- Keep `PageHeader` at the top of pages. Keep the dnd-kit board, recharts, drawers, tables,
  pagination, filters and sorting fully functional.
- Texts, roles, aria-labels and placeholders are what the Playwright e2e tests (`e2e/tests`) select
  by — do not rename them.
