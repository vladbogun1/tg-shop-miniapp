import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "./eslint/architecture-limits.mjs";
import { frontRules } from "./eslint/front-rules.mjs";
import legacyLimits from "./eslint.legacy-limits.mjs";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// shared/src раньше не линтился вообще (у пакета не было скриптов). Те же правила, что у приложений.
const config = [
  { ignores: ["node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@next/next/no-img-element": "off" } },
  ...architectureLimits(legacyLimits),
  // Файлы, ради которых правила и существуют (станут core/http, core/money, core/format).
  ...frontRules({
    allow: {
      "no-fetch": ["src/http.ts"],
      "money-div-mul-100": ["src/money.ts"],
      "to-fixed": ["src/money.ts"],
      "time-new-date": ["src/format.ts"],
      "time-date-now": ["src/format.ts"],
      "time-to-locale": ["src/format.ts", "src/money.ts"],
      "time-intl-datetimeformat": ["src/format.ts"],
    },
  }),
];

export default config;
