// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "app/brands/page.tsx",
    "app/cards/page.tsx",
    "app/categories/page.tsx",
    "app/dispatch/page.tsx",
    "app/inbox/page.tsx",
    "app/preorders/[id]/page.tsx",
    "app/products/page.tsx",
    "app/translations/page.tsx",
    "components/inbox/InboxRow.tsx",
    "lib/api.ts",
  ],
  "max-lines": [
    "app/brands/page.tsx",
    "app/categories/page.tsx",
    "app/inbox/page.tsx",
    "app/products/page.tsx",
    "lib/api.ts",
  ],
  "max-depth": [],
};

export default legacy;
