import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "../packages/core/eslint/architecture-limits.mjs";
import { frontRules } from "../packages/core/eslint/front-rules.mjs";

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
  // Translation dictionaries are data, their length says nothing about complexity.
  ...architectureLimits(["i18n/{en,ru,uk}.ts"]),
  // Единые способы и совместимость браузеров: счётные правила и запреты — error (храповик обнулён, baseline пуст).
  ...frontRules({ customer: true, skipCyrillic: ["i18n/**", "**/*.data.ts"] }),
  // Хуки: зависимости эффектов — честно, без eslint-disable (храповик обнулён).
  { rules: { "react-hooks/exhaustive-deps": "error" } },
];

export default config;
