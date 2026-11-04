/**
 * Достаём JSON из ответа ИИ: блок ```json``` или самый внешний {…}; чиним висячие запятые и «умные» кавычки.
 * Чистая логика. (Похожий разбор есть у «Карточек» — там он заточен под ключи товаров "p…".)
 */
export interface JsonResult {
  value: unknown;
  error: string | null;
  notes: string[];
}

function block(text: string): string | null {
  const fence = /```[^\n`]*\n?([\s\S]*?)```/.exec(text);
  if (fence && fence[1].includes("{")) return fence[1];
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  return a >= 0 && b > a ? text.slice(a, b + 1) : null;
}

export function extractJson(text: string): JsonResult {
  const raw = block(text);
  if (raw == null) return { value: null, error: "В ответе нет JSON — попросите ИИ ответить одним блоком ```json```", notes: [] };
  const noCommas = (s: string) => s.replace(/,(\s*[}\]])/g, "$1");
  const smart = (s: string) => s.replace(/[“”„‟″]/g, '"');
  const attempts: { text: string; note?: string }[] = [
    { text: raw },
    { text: noCommas(raw), note: "убраны висячие запятые" },
    { text: noCommas(smart(raw)), note: "«умные» кавычки заменены на обычные" },
  ];
  let first = "";
  for (const at of attempts) {
    try {
      return { value: JSON.parse(at.text), error: null, notes: at.note ? [at.note] : [] };
    } catch (e) {
      if (!first) first = e instanceof Error ? e.message : String(e);
    }
  }
  return { value: null, error: `JSON не читается: ${first}. Если ответ оборван — попросите ИИ повторить целиком.`, notes: [] };
}
