import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

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
];

export default config;
