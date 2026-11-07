/**
 * «Карточки» ↔ конфликт правок с сервера: поля, изменённые после запуска ИИ, приходят в виде порта предмета
 * (`spec:<key>` — JSON-текст значения, категория и бренд — id). Здесь они переводятся в вид строк ревью: число с
 * единицей, подпись варианта, slug категории. Чистая логика.
 */
import type { EditorView, FieldChangeView } from "@/features/ai";
import type { CardItem } from "./item";
import type { CardSchema } from "./schema";
import { formatValue } from "./value";

/** Ответ сервера о правках (форма `AiJobDto.subjectChanges`); значения могут быть null — поле было/стало пустым. */
export interface ServerChanges {
  fields: { key: string; before?: string | null; after?: string | null }[];
  editors: { name: string; at: string }[];
}

export interface CardChanges {
  /** Ключ строки ревью → было/стало в виде для показа. */
  fields: Record<string, FieldChangeView>;
  editors: EditorView[];
}

const SPEC = "spec:";
const TEXT_MAX = 60;

function specText(schema: CardSchema, key: string, raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const attr = schema.attributes.find((a) => a.key === key);
  try {
    return formatValue(attr, JSON.parse(raw));
  } catch {
    return raw;
  }
}

const short = (v: string | null | undefined) => (!v ? null : v.length > TEXT_MAX ? `${v.slice(0, TEXT_MAX - 1)}…` : v);
const categorySlug = (schema: CardSchema, id: string | null | undefined) =>
  !id ? null : schema.categories.find((c) => c.id === id)?.slug ?? id;

function view(key: string, c: ServerChanges["fields"][number], item: CardItem, schema: CardSchema): FieldChangeView {
  if (key.startsWith(SPEC)) {
    const name = key.slice(SPEC.length);
    return { before: specText(schema, name, c.before), after: specText(schema, name, c.after) };
  }
  if (key === "category") return { before: categorySlug(schema, c.before), after: categorySlug(schema, c.after) };
  // Бренд сервер называет id, а справочника брендов на экране нет: «стало» — из свежей карточки, «было» — не назвать.
  if (key === "brand") return { before: c.before ? undefined : null, after: item.brand?.trim() || null };
  return { before: short(c.before), after: short(c.after) };
}

/** Правки с сервера → вид для строк ревью; null — у задачи нет снимка (старая) или результат уже разобран. */
export function cardChanges(server: ServerChanges | null | undefined, item: CardItem, schema: CardSchema): CardChanges | null {
  if (!server) return null;
  const fields: Record<string, FieldChangeView> = {};
  for (const c of server.fields) fields[c.key] = view(c.key, c, item, schema);
  return { fields, editors: server.editors.map((e) => ({ name: e.name, at: e.at })) };
}
