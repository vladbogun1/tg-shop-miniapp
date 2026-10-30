import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "../packages/core/eslint/architecture-limits.mjs";
import { frontRules } from "../packages/core/eslint/front-rules.mjs";
import legacyLimits from "./eslint.legacy-limits.mjs";

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
  // Size/complexity limits: error for new code, warning for files in eslint.legacy-limits.mjs.
  ...architectureLimits(legacyLimits),
  // Единые способы и совместимость браузеров: счётные правила — warn (храповик), запреты — error.
  ...frontRules({ customer: false, compat: false, allow: { "time-date-now": ["next.config.ts", "public/sw.js"] } }),
];

export default config;
