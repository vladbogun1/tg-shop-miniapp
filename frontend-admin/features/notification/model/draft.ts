import { localStore } from "@shop/core/storage";
import { EMPTY_TEXTS, type ComposeValues, type Texts } from "./compose";
import type { BroadcastAudience, BroadcastHistoryItem, ShopLang } from "./types";

const DRAFT_KEY = "admin.broadcast.draft.v1";

/** Формат в localStorage не менялся: тексты вложенным объектом. */
export interface Draft {
  texts: Texts;
  audience: BroadcastAudience;
  lang: ShopLang | "";
  withButton: boolean;
  buttonText: string;
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStore.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    return {
      texts: { ...EMPTY_TEXTS, ...(d.texts ?? {}) },
      audience: d.audience ?? "all",
      lang: d.lang ?? "",
      withButton: d.withButton ?? true,
      buttonText: d.buttonText ?? "",
    };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft | null): void {
  try {
    if (d) localStore.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStore.removeItem(DRAFT_KEY);
  } catch {
    // private mode / blocked storage — the draft simply does not persist
  }
}

/** Что писать в черновик: пусто и без текста кнопки — черновика нет. */
export function draftOf(v: ComposeValues): Draft | null {
  const texts: Texts = { main: v.main, uk: v.uk, ru: v.ru, en: v.en };
  const empty = !Object.values(texts).some((t) => t.trim());
  return empty && !v.buttonText ? null : { texts, audience: v.audience, lang: v.lang, withButton: v.withButton, buttonText: v.buttonText };
}

export function valuesFromDraft(d: Draft): Partial<ComposeValues> {
  return { ...d.texts, audience: d.audience, lang: d.lang, withButton: d.withButton, buttonText: d.buttonText };
}

/** «В черновик» из истории: тексты, аудитория, язык и кнопка; текст кнопки не меняется. */
export function valuesFromHistory(h: BroadcastHistoryItem): Partial<ComposeValues> {
  return {
    main: h.text,
    uk: h.textUk ?? "",
    ru: h.textRu ?? "",
    en: h.textEn ?? "",
    audience: h.audience,
    lang: h.lang ?? "",
    withButton: h.withButton,
  };
}

export function userLabel(u: { firstName?: string | null; lastName?: string | null; username?: string | null; telegramUserId: number }): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : "#" + u.telegramUserId);
}
