/**
 * Правила зависимостей фронтов (docs/ARCHITECTURE-FRONT.md, 2.4 и 2.7.1).
 * Запускает scripts/check-arch-front.mjs; существующие нарушения записаны в known-violations.json
 * (храповик: новое нарушение или рост числа — падение, снижение — подсказка понизить).
 *
 * Часть правил (features/*, realtime) сегодня пустая — каталогов `features/` ещё нет; они начнут
 * работать сами, когда фичи появятся (шаги 3–7), и сразу охраняют границы.
 */
const APPS = "frontend|frontend-admin|site";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Циклов между модулями нет (цикл = невозможно понять и протестировать по отдельности).",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-cross-app",
      comment: "Приложение не импортирует чужое приложение (общее — только через shared / @shop/*).",
      severity: "error",
      from: { path: `^(${APPS})/` },
      to: { path: `^(${APPS})/`, pathNot: "^$1/" },
    },
    {
      name: "shared-not-app",
      comment: "shared/packages не знают приложений.",
      severity: "error",
      from: { path: "^(shared|packages)/" },
      to: { path: `^(${APPS})/` },
    },
    {
      name: "core-no-react",
      comment: "Ядро (shared/src без ui, packages/core) — чистый TS: без React, DOM-компонентов и Next.",
      severity: "error",
      from: { path: "^(shared/src/(?!ui/)|packages/core/)" },
      to: { path: "node_modules/(react|react-dom|next|framer-motion|lucide-react)/", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "components-not-app",
      comment: "components/ не импортирует app/ (маршруты — оболочка, а не библиотека).",
      severity: "error",
      from: { path: `^(${APPS})/components/` },
      to: { path: `^(${APPS})/app/` },
    },
    {
      name: "lib-not-components",
      comment: "lib/ (логика) не импортирует components/ (вёрстку).",
      severity: "error",
      from: { path: `^(${APPS})/lib/`, pathNot: "[.]tsx$" },
      to: { path: `^(${APPS})/components/` },
    },
    {
      name: "ws-only-from-realtime",
      comment: "WebSocket/STOMP подключается только в shell/realtime.ts (сообщение → invalidate ключей).",
      severity: "error",
      from: { path: `^(${APPS})/`, pathNot: "(^|/)shell/realtime[.]ts$|(^|/)lib/ws[.]ts$" },
      to: { path: "(^shared/src/ws[.]ts$|/lib/ws[.]ts$|node_modules/@stomp/)" },
    },
    {
      name: "features-via-index",
      comment: "Фича зависит от другой фичи только через её index.ts.",
      severity: "error",
      from: { path: "^((?:frontend|frontend-admin|site)/features/([^/]+))/" },
      to: {
        path: "^(?:frontend|frontend-admin|site)/features/([^/]+)/(?!index[.]tsx?$)",
        pathNot: "^(?:frontend|frontend-admin|site)/features/$2/",
      },
    },
    {
      name: "app-not-feature-internals",
      comment: "app/ видит из фич только index.ts (экран, хуки, типы).",
      severity: "error",
      from: { path: `^(${APPS})/app/` },
      to: { path: `^(${APPS})/features/[^/]+/(ui|api|model|queries|keys|store)` },
    },
    {
      name: "feature-api-model-no-react",
      comment: "features/*/api и model не знают React (кроме queries.ts и ui/).",
      severity: "error",
      from: { path: `^(${APPS})/features/[^/]+/(api|model)(/|[.])` },
      to: { path: "node_modules/(react|react-dom|next|@tanstack/react-query)/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    exclude: { path: "(^|/)([.]next|node_modules|scripts)/|[.]d[.]ts$" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["import", "require", "node", "default"] },
  },
};
