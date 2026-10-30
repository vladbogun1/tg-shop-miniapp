// Файлы shared/src, нарушавшие лимиты на 2026-10-30 (до этого shared не линтился). Только уменьшать — см. docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "src/catalog.ts",
    "src/compare.ts",
    "src/giftcase.ts",
    "src/http.ts",
    "src/ui/GiftCaseOpening.tsx",
    "src/ui/GiftCaseParts.tsx",
  ],
  "max-depth": [
    "src/compare.ts",
  ],
  "max-lines": [
    "src/catalog.ts",
    "src/ui/GiftCaseOpening.tsx",
    "src/ui/GiftCaseParts.tsx",
  ],
};

export default legacy;
