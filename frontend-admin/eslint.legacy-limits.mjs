// Files that already broke a limit from ../packages/core/eslint/architecture-limits.mjs on 2026-10-29.
// They get a warning for that rule instead of an error. Do not add new files here — split the code;
// remove a file once it is back under the limit. See docs/ARCHITECTURE-CHECKS.md.
// Админка (шаг 4f, 31.10.2026): список пуст — все файлы в пределах лимитов.
const legacy = {
  "complexity": [],
  "max-lines": [],
  "max-depth": [],
};

export default legacy;
