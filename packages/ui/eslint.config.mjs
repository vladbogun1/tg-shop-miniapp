import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "../core/eslint/architecture-limits.mjs";
import { frontRules } from "../core/eslint/front-rules.mjs";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: ["node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { rules: { "@next/next/no-img-element": "off" } },
  ...architectureLimits(),
  ...frontRules({}),
  // Хуки: зависимости эффектов — честно, без eslint-disable (храповик обнулён).
  { rules: { "react-hooks/exhaustive-deps": "error" } },
];

export default config;
