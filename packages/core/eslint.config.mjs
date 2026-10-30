import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "./eslint/architecture-limits.mjs";
import { frontRules } from "./eslint/front-rules.mjs";
import legacyLimits from "./eslint.legacy-limits.mjs";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ["node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@next/next/no-img-element": "off" } },
  ...architectureLimits(legacyLimits),
  // Файлы, ради которых правила существуют (у каждого файла — ровно одна группа: списки не должны пересекаться).
  ...frontRules({
    allow: {
      "no-fetch": ["src/http.ts"],
      "money-div-mul-100": ["src/money.ts"],
      "to-fixed": ["src/money.ts"],
      "time-to-locale": ["src/money.ts"],
      "time-new-date": ["src/time.ts"],
      "time-date-now": ["src/time.ts"],
      "time-intl-datetimeformat": ["src/time.ts"],
      "no-web-storage": ["src/storage.ts"],
      "stale-time-literal": ["src/query.ts"],
      "refetch-interval-literal": ["src/query.ts"],
    },
  }),
];

export default config;
