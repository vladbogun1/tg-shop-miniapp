/** Только для тестов-сторожей: коды, которые бэкенд пишет в журналы, прочитанные из исходников Java. */
import fs from "node:fs";
import path from "node:path";

const JAVA_ROOT = path.resolve(__dirname, "../../backend/src/main/java");

function javaSources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) javaSources(p, out);
    else if (p.endsWith(".java")) out.push(fs.readFileSync(p, "utf8"));
  }
  return out;
}

/** Первые группы регулярок по всем исходникам, без повторов, по алфавиту. */
export function backendCodes(patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const src of javaSources(JAVA_ROOT)) {
    for (const re of patterns) for (const m of src.matchAll(re)) found.add(m[1]);
  }
  return [...found].sort();
}

/** `audit.record("КОД", …)` — действия админов. */
export const AUDIT_CODE_PATTERNS = [/\.record\(\s*"([A-Z][A-Z0-9_]+)"/g];

/** `send("метод", "ТИП", …)` у покупателя и `send("ТИП", …)` у предзаказов — сообщения бота. */
export const BOT_TYPE_PATTERNS = [/\bsend\(\s*"[A-Za-z]+",\s*"([A-Z][A-Z_]+)"/g, /\bsend\(\s*"([A-Z][A-Z_]+)",/g];
