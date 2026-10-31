import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { architectureLimits } from "../core/eslint/architecture-limits.mjs";
import { frontRules } from "../core/eslint/front-rules.mjs";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// Новый пакет: без списка исключений по размеру — лимиты (400 строк, complexity 15, depth 4) действуют для всех файлов.
const config = [
  { ignores: ["node_modules/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...architectureLimits({}),
  ...frontRules({}),
];

export default config;
