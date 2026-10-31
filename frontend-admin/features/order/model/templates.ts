/** Шаблоны ответов: правила редактора (без React). */
import type { ReplyTemplate } from "../api";

export type TemplateLang = "uk" | "ru" | "en";

export interface TemplateDraft {
  title: string;
  ru: string;
  uk: string;
  en: string;
}

export const EMPTY_DRAFT: TemplateDraft = { title: "", ru: "", uk: "", en: "" };

export function draftOf(t: ReplyTemplate | null): TemplateDraft {
  return { title: t?.title ?? "", ru: t?.bodyRu ?? "", uk: t?.bodyUk ?? "", en: t?.bodyEn ?? "" };
}

/** Есть несохранённые правки (закрытие спросит подтверждение). */
export function isDraftDirty(t: ReplyTemplate | null, d: TemplateDraft): boolean {
  const saved = draftOf(t);
  return d.title !== saved.title || d.ru !== saved.ru || d.uk !== saved.uk || d.en !== saved.en;
}

/** A uk/en text made for an older Russian one is not used in the chat until it is redone. */
export function isTranslationStale(t: ReplyTemplate | null, lang: "uk" | "en", d: TemplateDraft): boolean {
  const saved = draftOf(t);
  const flagged = lang === "uk" ? t?.ukStale : t?.enStale;
  const untouched = lang === "uk" ? d.uk === saved.uk : d.en === saved.en;
  return !!flagged && untouched && d.ru === saved.ru;
}

export function bodyLabel(lang: TemplateLang): string {
  if (lang === "ru") return "Текст на русском (обязательно)";
  return lang === "uk" ? "Текст українською (необязательно)" : "Text in English (необязательно)";
}

/** Тело записи: русский обязателен, остальные пустые, если не заполнены. */
export function toWrite(d: TemplateDraft, sort: number | undefined) {
  return { title: d.title.trim(), bodyRu: d.ru.trim(), bodyUk: d.uk.trim(), bodyEn: d.en.trim(), sort };
}

export function canSaveDraft(d: TemplateDraft): boolean {
  return !!d.title.trim() && !!d.ru.trim();
}
