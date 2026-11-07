/**
 * Замер «Поставка с ИИ», шаг 1: картинки накладной / скрины заказа → тот же промпт EXTRACT_PROMPT → JSON строк.
 * PDF модель не принимает — страницы заранее перегнать в PNG (pdf-to-png.py рядом).
 *
 *   npx tsx --tsconfig scripts/ai-bench/tsconfig.json scripts/ai-bench/bench-extract.mts <папка с картинками> [--model …] [--effort low]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { EXTRACT_PROMPT } from "@/features/supply/model/ai/extract-prompt";
import { parseExtract } from "@/features/supply/model/ai/parse";
import { call, fmtUsage, type Block } from "./minimax.mts";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const DIR = process.argv[2];
const MODEL = arg("model", "MiniMax-M3.1-Flash");
const EFFORT = arg("effort", "low") as "low";
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function main() {
  if (!DIR) throw new Error("Укажите папку с картинками документа");
  const files = readdirSync(DIR).filter((f) => MIME[extname(f).toLowerCase()]).sort();
  if (!files.length) throw new Error(`В ${DIR} нет png/jpg/webp`);
  const images: Block[] = files.map((f) => ({
    type: "image",
    source: { type: "base64", media_type: MIME[extname(f).toLowerCase()], data: readFileSync(join(DIR, f)).toString("base64") },
  }));
  const out = `_tmp/ai-bench/extract-${basename(DIR)}-${MODEL}-${EFFORT}`;
  mkdirSync(out, { recursive: true });
  console.log(`${files.length} картинок, модель ${MODEL}, effort ${EFFORT}…`);

  // Неизменная инструкция — первой (кэш по префиксу), картинки — после.
  const r = await call([{ role: "user", content: [{ type: "text", text: EXTRACT_PROMPT }, ...images] }], { model: MODEL, effort: EFFORT, maxTokens: 32000 });
  writeFileSync(`${out}/answer.md`, r.text);
  writeFileSync(`${out}/raw.json`, JSON.stringify(r.raw, null, 2));

  const p = parseExtract(r.text);
  const lines = p.doc?.lines ?? [];
  const sum = lines.reduce((s, l) => s + (l.lineTotal ?? (l.unitPrice ?? 0) * l.qty), 0);
  const report = [
    `# Накладная ${basename(DIR)}: ${MODEL}, effort ${EFFORT}`,
    "```",
    fmtUsage(r),
    "```",
    `Строк ${lines.length}, поставщик ${p.doc?.supplier ?? "—"}, валюта ${p.doc?.currency ?? "—"}, итог документа ${p.doc?.total ?? "—"}, сумма строк ${sum.toFixed(2)}`,
    p.errors.length ? `Ошибки: ${p.errors.join("; ")}` : "Ошибок разбора нет",
    "",
    ...lines.map((l) => `- ${l.qty} × ${l.unitPrice} | ${l.brand ?? "?"} ${l.model ?? ""} ${l.color ?? ""} | ${l.text}${l.variant ? ` [${l.variant}]` : ""}${l.notes ? ` — ${l.notes}` : ""}`),
  ].join("\n");
  writeFileSync(`${out}/REPORT.md`, report);
  console.log(report);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
