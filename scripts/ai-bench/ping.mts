/** Пробный запрос: без поиска и с одним поиском — проверить ключ и как считаются токены/поиски. */
import { writeFileSync, mkdirSync } from "node:fs";
import { call, fmtUsage } from "./minimax.mts";

const OUT = "_tmp/ai-bench/ping";
mkdirSync(OUT, { recursive: true });

const a = await call([{ role: "user", content: "Ответь одним словом: столица Украины?" }], { maxTokens: 2000 });
console.log("— без поиска:", a.text.trim(), "\n" + fmtUsage(a));
writeFileSync(`${OUT}/plain.json`, JSON.stringify(a.raw, null, 2));

const b = await call(
  [{ role: "user", content: "Найди в интернете вес мыши Logitech G Pro X Superlight 2 в граммах. Ответь числом и ссылкой на источник." }],
  { maxTokens: 4000, search: true },
);
console.log("\n— с поиском:", b.text.trim(), "\n" + fmtUsage(b), "\nссылок из поиска:", b.searchUrls.length);
writeFileSync(`${OUT}/search.json`, JSON.stringify(b.raw, null, 2));
