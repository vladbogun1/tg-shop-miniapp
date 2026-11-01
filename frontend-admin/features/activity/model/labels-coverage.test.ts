/**
 * Сторож подписей: каждый код журнала админа (`audit.record("CODE", …)`) и каждый тип сообщения бота
 * (`send("метод", "TYPE", …)` у покупателя, `send("TYPE", …)` у предзаказов) из Java имеет подпись в админке.
 * Новый код без подписи показывался бы владельцу сырой строкой — тест падает раньше.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABEL } from "@/features/staff/model/audit-labels";
import { TYPE_LABEL } from "./labels";

const JAVA_ROOT = path.resolve(__dirname, "../../../../backend/src/main/java");

function javaSources(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) javaSources(p, out);
    else if (p.endsWith(".java")) out.push(fs.readFileSync(p, "utf8"));
  }
  return out;
}

function collect(sources: string[], patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const src of sources) {
    for (const re of patterns) for (const m of src.matchAll(re)) found.add(m[1]);
  }
  return [...found].sort();
}

const sources = javaSources(JAVA_ROOT);

describe("подписи кодов из бэкенда", () => {
  it("каждый код журнала админа имеет подпись", () => {
    const codes = collect(sources, [/\.record\(\s*"([A-Z][A-Z0-9_]+)"/g]);
    expect(codes.length).toBeGreaterThan(50); // регулярка не должна молча перестать находить коды
    expect(codes.filter((c) => !(c in AUDIT_ACTION_LABEL))).toEqual([]);
  });

  it("каждый тип сообщения бота имеет подпись в журнале «Бот и сайт»", () => {
    const types = collect(sources, [/\bsend\(\s*"[A-Za-z]+",\s*"([A-Z][A-Z_]+)"/g, /\bsend\(\s*"([A-Z][A-Z_]+)",/g]);
    expect(types.length).toBeGreaterThan(15);
    expect(types.filter((t) => !(t in TYPE_LABEL))).toEqual([]);
  });
});
