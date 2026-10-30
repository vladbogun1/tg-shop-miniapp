// Файлы packages/core/src, нарушавшие лимиты на 2026-10-30. Только уменьшать — см. docs/ARCHITECTURE-CHECKS.md.
const legacy = {
  "complexity": [
    "src/catalog.ts",
    "src/compare.ts",
    "src/giftcase.ts",
    "src/http.ts",
  ],
  "max-depth": [
    "src/compare.ts",
  ],
  "max-lines": [
    "src/catalog.ts",
  ],
};

export default legacy;
