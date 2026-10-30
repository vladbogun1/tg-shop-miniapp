/**
 * Правила «одна задача — один способ» (docs/ARCHITECTURE-FRONT.md, 2.5) и совместимость браузеров
 * (docs/BROWSER-SUPPORT.md) для всех фронтов.
 *
 * Две группы:
 *  1. СЧЁТНЫЕ (warn, храповик): текущий код их нарушает, число нарушений записано в
 *     `frontend-baseline.txt` и проверяется `scripts/check-front-ratchet.mjs` — рост валит CI,
 *     снижение — подсказка понизить baseline. Когда по правилу ноль — его переводят в error.
 *  2. ЖЁСТКИЕ (error): нарушений нет и быть не должно (lookbehind, `toSorted`… — iOS 15.4).
 *
 * У счётных правил сообщение начинается с `[id]` — по этому id их считает храповик
 * (у ESLint все они приходят под ruleId `front/ratchet` или `no-restricted-globals`).
 */

const CYR = "А-Яа-яЁёЄєІіЇїҐґ";

/** @typedef {{ id: string, selector: string, message: string, customerOnly?: boolean }} Selector */

/** @type {Selector[]} */
export const RATCHET_SELECTORS = [
  {
    id: "no-web-storage",
    selector: "MemberExpression[object.name='window'][property.name=/^(local|session)Storage$/]",
    message: "localStorage/sessionStorage — только через core/storage (try/catch, префикс ключа).",
  },
  {
    id: "no-confirm-alert",
    selector: "MemberExpression[object.name='window'][property.name=/^(confirm|alert)$/]",
    message: "window.confirm/alert запрещены — useConfirm() и toast из @shop/ui.",
  },
  {
    id: "query-key-literal",
    selector: "Property[key.name='queryKey'] > ArrayExpression[elements.0.type='Literal']",
    message: "Литерал в queryKey — ключи только из фабрики keys.ts фичи.",
  },
  {
    id: "stale-time-literal",
    selector: "Property[key.name='staleTime'][value.type=/^(Literal|BinaryExpression)$/]",
    message: "staleTime литералом — только пресеты QUERY_PRESETS.",
  },
  {
    id: "refetch-interval-literal",
    selector: "Property[key.name='refetchInterval'][value.type=/^(Literal|BinaryExpression)$/]",
    message: "refetchInterval литералом — только пресет live.",
  },
  {
    id: "money-div-mul-100",
    selector: "BinaryExpression[operator=/^[*\\/]$/][right.value=100]",
    message: "Деньги — money()/toMinor/toMajor из core/money, а не ручное `/ 100` и `* 100`.",
  },
  {
    id: "to-fixed",
    selector: "CallExpression[callee.property.name='toFixed']",
    message: "toFixed — форматировать деньги через money() из core/money.",
  },
  {
    id: "time-new-date",
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "new Date() без аргумента — now() из core/time (подменяется в тестах).",
  },
  {
    id: "time-date-now",
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: "Date.now — now() из core/time.",
  },
  {
    id: "time-to-locale",
    selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
    message: "toLocale* — форматтеры formatDate/Time/DateTime из core/time и core/format.",
  },
  {
    id: "time-intl-datetimeformat",
    selector: "MemberExpression[object.name='Intl'][property.name='DateTimeFormat']",
    message: "Intl.DateTimeFormat — форматтеры из core/time и core/format.",
  },
  {
    id: "cyrillic-literal",
    customerOnly: true,
    selector: `:matches(Literal, JSXText)[value=/[${CYR}]/], TemplateElement[value.raw=/[${CYR}]/]`,
    message: "Кириллица в коде покупательского приложения — текст через словарь i18n.",
  },
];

/**
 * Локальный плагин: `front/ratchet` — «no-restricted-syntax», у которого у каждого селектора свой id в
 * сообщении (core-правило не умеет mixed severity, а нам нужны и warn-счётчики, и error-запреты).
 */
const plugin = {
  rules: {
    ratchet: {
      meta: { type: "suggestion", schema: [{ type: "array" }] },
      create(context) {
        const visitor = {};
        for (const { id, selector, message } of context.options[0] ?? []) {
          const handler = (node) => context.report({ node, message: `[${id}] ${message}` });
          const prev = visitor[selector];
          visitor[selector] = prev ? (n) => (prev(n), handler(n)) : handler;
        }
        return visitor;
      },
    },
  },
};

const GLOBALS = [
  { id: "no-fetch", name: "fetch", message: "Прямой fetch запрещён — HttpClient из core/http (пути только в features/*/api.ts)." },
  { id: "no-web-storage", name: "localStorage", message: "localStorage — только через core/storage." },
  { id: "no-web-storage", name: "sessionStorage", message: "sessionStorage — только через core/storage." },
  { id: "no-confirm-alert", name: "confirm", message: "confirm запрещён — useConfirm()." },
  { id: "no-confirm-alert", name: "alert", message: "alert запрещён — toast." },
];

// ---- жёсткие (error): iOS Safari 15.4 / Chrome 92, docs/BROWSER-SUPPORT.md ----
const COMPAT_SYNTAX = [
  {
    selector: "Literal[regex.pattern=/\\(\\?<[=!]/]",
    message: "Lookbehind в регулярках — Safari 16.4+. Захватить предыдущий символ группой (docs/BROWSER-SUPPORT.md).",
  },
  {
    selector: "NewExpression[callee.name='RegExp'] > Literal:first-child[value=/\\(\\?<[=!]/]",
    message: "Lookbehind в new RegExp('…') — Safari 16.4+ (docs/BROWSER-SUPPORT.md).",
  },
  { selector: "Literal[regex.flags=/v/]", message: "Флаг v у RegExp — Safari 17; используйте u." },
  { selector: "StaticBlock", message: "static { } в классах — Safari 16.4; присвойте после объявления класса." },
];

const COMPAT_PROPERTIES = [
  ...["toSorted", "toReversed", "toSpliced"].map((property) => ({
    property,
    message: `.${property}() — Safari 16+; используйте [...arr].sort()/reverse()/splice().`,
  })),
  ...["isSubsetOf", "isSupersetOf", "isDisjointFrom", "symmetricDifference"].map((property) => ({
    property,
    message: `Set#${property} — Safari 17; используйте циклы.`,
  })),
  { object: "Object", property: "groupBy", message: "Object.groupBy — Safari 17.4; используйте reduce." },
  { object: "Map", property: "groupBy", message: "Map.groupBy — Safari 17.4; используйте reduce." },
  { object: "Promise", property: "withResolvers", message: "Promise.withResolvers — Safari 17.4; new Promise((res, rej) => …)." },
  { object: "Array", property: "fromAsync", message: "Array.fromAsync — Safari 16.4; используйте Promise.all." },
];

const COMPAT_RULES = {
  "no-restricted-syntax": ["error", ...COMPAT_SYNTAX],
  "no-restricted-properties": ["error", ...COMPAT_PROPERTIES],
};

/** { id: [файлы] } -> [{ files, ids: Set }]: правила с одинаковым списком файлов исключений склеиваются. */
function groupByFiles(allow) {
  const byFiles = new Map();
  for (const [id, files] of Object.entries(allow)) {
    const key = JSON.stringify(files);
    byFiles.set(key, { files, ids: new Set([...(byFiles.get(key)?.ids ?? []), id]) });
  }
  return [...byFiles.values()];
}

/**
 * @param {object} opts
 * @param {boolean} [opts.customer] покупательское приложение: включает правило кириллицы
 * @param {Record<string, string[]>} [opts.allow] id счётного правила → файлы (глобы относительно конфига), где оно не действует
 * @param {string[]} [opts.testFiles] глобы тестов — счётные правила там выключены
 * @param {string[]} [opts.skipCyrillic] глобы словарей/юр. текстов
 * @param {boolean} [opts.compat] запреты iOS 15.4 (false — админка: только свежие десктопные браузеры)
 * @param {string[]} [opts.serverOnly] файлы, которые никогда не попадают в браузер (запреты совместимости там не нужны)
 */
export function frontRules({
  customer = false,
  allow = {},
  testFiles = ["**/*.test.{ts,tsx}"],
  skipCyrillic = ["i18n/**"],
  compat = true,
  serverOnly = [],
} = {}) {
  const active = RATCHET_SELECTORS.filter((s) => customer || !s.customerOnly);
  const ratchetRules = (excluded = new Set()) => ({
    "front/ratchet": ["warn", active.filter((s) => !excluded.has(s.id))],
    "no-restricted-globals": [
      "warn",
      ...GLOBALS.filter((g) => !excluded.has(g.id)).map(({ id, name, message }) => ({ name, message: `[${id}] ${message}` })),
    ],
  });

  const configs = [
    {
      plugins: { front: plugin },
      rules: {
        ...ratchetRules(),
        ...(compat ? COMPAT_RULES : {}),
        "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true }],
      },
    },
  ];

  // Исключения: файлы, ради которых правило и существует (core/http, core/format …).
  for (const { files, ids } of groupByFiles(allow)) configs.push({ files, rules: ratchetRules(ids) });

  if (customer && skipCyrillic.length > 0) {
    configs.push({ files: skipCyrillic, rules: ratchetRules(new Set(["cyrillic-literal"])) });
  }
  if (serverOnly.length > 0) {
    configs.push({ files: serverOnly, rules: { "no-restricted-syntax": "off", "no-restricted-properties": "off" } });
  }
  configs.push({
    files: testFiles,
    rules: { "front/ratchet": "off", "no-restricted-globals": "off", "max-lines-per-function": "off" },
  });
  return configs;
}
