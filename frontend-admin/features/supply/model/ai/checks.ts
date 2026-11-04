/** Проверка арифметики документа: цена × количество = сумма строки, сумма строк = итог, похожие на повтор строки. Чистая логика. */
import { toMajor, toMinor } from "@shop/core/money";
import { sourceKey } from "./normalize";
import type { ExtractedDoc, SourceLine } from "./types";

/** Расхождение до 1 % (и не меньше 0.02) — округления продавца, не ошибка чтения. */
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.01);
}

/** До копеек / фэней — сумма в валюте документа. */
export const round2 = (n: number) => toMajor(toMinor(n));

/** Ошибка арифметики строки или null. */
export function lineProblem(l: SourceLine): string | null {
  if (l.unitPrice == null) return "нет цены";
  if (l.lineTotal != null && !close(l.unitPrice * l.qty, l.lineTotal)) {
    return `${l.unitPrice} × ${l.qty} = ${round2(l.unitPrice * l.qty)}, а в документе ${l.lineTotal}`;
  }
  return null;
}

export function linesSum(lines: SourceLine[]): number {
  return round2(lines.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0));
}

/** Итог документа против суммы строк; null — сходится или итога нет. */
export function totalProblem(doc: ExtractedDoc, lines: SourceLine[] = doc.lines): string | null {
  if (doc.total == null) return null;
  const sum = linesSum(lines);
  return close(sum, doc.total) ? null : `сумма строк ${sum}, а итог документа ${doc.total} (разница ${round2(doc.total - sum)})`;
}

/** Id строк, у которых до них уже была такая же (текст, вариант, цена, количество) — скорее всего перекрытие скринов. */
export function likelyRepeats(lines: SourceLine[]): Set<string> {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const l of lines) {
    const k = `${sourceKey(l.text, l.variant)}|${l.unitPrice}|${l.qty}`;
    if (seen.has(k)) out.add(l.id);
    seen.add(k);
  }
  return out;
}
