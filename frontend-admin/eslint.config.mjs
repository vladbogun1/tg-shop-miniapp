import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "../packages/core/eslint/architecture-limits.mjs";
import { frontRules } from "../packages/core/eslint/front-rules.mjs";

const ALLOW_RAW = ["next.config.ts", "public/sw.js", "lib/session.ts", "features/procurement/api.ts"];

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Lint was configured as `next lint` with no config file at all, so it never ran.
 * Flat config + next/core-web-vitals is what Next 15 expects.
 */
const config = [
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // The custom <Image> builds imgproxy URLs itself; next/image cannot.
      "@next/next/no-img-element": "off",
    },
  },
  // Size/complexity limits: error everywhere (no exceptions list).
  ...architectureLimits(),
  // Единые способы и совместимость браузеров: счётные правила — warn (храповик), запреты — error.
  ...frontRules({
    customer: false,
    compat: false,
    allow: {
      // Списки у правил одинаковые намеренно: frontRules склеивает правила только с равным списком файлов,
      // иначе второй блок для sw.js снова включил бы правило, исключённое в первом.
      // time-date-now: next.config.ts и sw.js (обычный JS, core/time недоступен).
      // no-fetch: sw.js (нет HttpClient), lib/session.ts (выход с keepalive и тихое обновление токена, ошибка не разлогинивает),
      // features/procurement/api.ts (скачивание файлов с токеном через blob; HttpClient разбирает только JSON).
      "time-date-now": ALLOW_RAW,
      "no-fetch": ALLOW_RAW,
    },
  }),
];

export default config;
