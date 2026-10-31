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
      comment: "Приложение не импортирует чужое приложение (общее — только через @shop/*).",
      severity: "error",
      from: { path: `^(${APPS})/` },
      to: { path: `^(${APPS})/`, pathNot: "^$1/" },
    },
    {
      name: "packages-not-app",
      comment: "packages/* не знают приложений.",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: `^(${APPS})/` },
    },
    {
      name: "package-direction",
      comment: "Направление пакетов: ui → core, customer → ui, core; обратно нельзя (docs/ARCHITECTURE-FRONT.md, 2.2).",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^packages/(ui|customer)/" },
    },
    {
      name: "ui-not-customer",
      comment: "@shop/ui не знает @shop/customer.",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: { path: "^packages/customer/" },
    },
    {
      name: "core-no-react",
      comment: "Ядро (packages/core) — чистый TS: без React, DOM-компонентов и Next.",
      severity: "error",
      from: { path: "^packages/core/" },
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
      name: "no-legacy-ui-paths",
      comment: "Тосты, модалки, подтверждения и примитивы — только из @shop/ui (шаг 2): старые пути приложений удалены.",
      severity: "error",
      from: { path: `^(${APPS})/` },
      to: {
        path: "(lib/toast|lib/overlay-stack|lib/use-back-close|components/ui/Toast|components/ui/Modal|components/ui/Drawer|components/ui/Lightbox|components/ui/ConfirmModal|components/ui/Button)[.]tsx?$",
      },
    },
    {
      name: "no-legacy-ui-primitives",
      comment: "Input/QtyStepper/RadioCard/StatusChip/button-styles покупательских приложений — из @shop/ui/primitives.",
      severity: "error",
      from: { path: "^(frontend|site)/" },
      to: {
        path: "components/ui/(Input|QtyStepper|RadioCard|StatusChip|button-styles)[.]tsx?$",
      },
    },
    {
      name: "ws-only-from-realtime",
      comment: "WebSocket/STOMP подключается только в shell/realtime.ts (сообщение → invalidate ключей).",
      severity: "error",
      from: { path: `^(${APPS})/`, pathNot: "(^|/)shell/realtime[.]ts$|(^|/)lib/ws[.]ts$" },
      to: { path: "(^packages/core/src/ws[.]ts$|/lib/ws[.]ts$|node_modules/@stomp/)" },
    },
    {
      name: "features-via-index",
      comment: "Фича зависит от другой фичи только через её index.ts или view/<Модуль>.ts (UI-вход: по файлу на экран/компонент, чтобы импорт не тянул соседей по барелю; index — хуки, модель, типы).",
      severity: "error",
      from: { path: "^((?:frontend|frontend-admin|site)/features/([^/]+))/" },
      to: {
        path: "^(?:frontend|frontend-admin|site)/features/([^/]+)/(?!index[.]tsx?$|view/)",
        pathNot: "^(?:frontend|frontend-admin|site)/features/$2/|^(?:frontend|frontend-admin|site)/features/[^/]+/server([.]ts|/)",
      },
    },
    {
      name: "client-not-server-features",
      comment: "Серверный код фич (features/*/server) в браузер не попадает: его импортируют только app/ и другой server-код (docs/ARCHITECTURE-FRONT.md, 3.1).",
      severity: "error",
      from: { path: "^(frontend|frontend-admin|site)/", pathNot: "^[^/]+/app/|^[^/]+/features/[^/]+/server([.]ts|/)|[.]test[.]tsx?$" },
      to: { path: "^(frontend|frontend-admin|site)/features/[^/]+/server([.]ts|/)" },
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
