import path from "node:path";
import { defineConfig } from "vitest/config";

// Юнит-тесты чистой логики (docs/ARCHITECTURE-FRONT.md, 2.5 «Тесты»). Next compiles with jsx "preserve",
// vitest needs it transformed; `@/*` is the app root, as in tsconfig.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["**/*.test.{ts,tsx}"], exclude: ["node_modules/**", ".next/**"] },
});
