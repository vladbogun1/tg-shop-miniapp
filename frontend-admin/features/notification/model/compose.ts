import { validateTelegramHtml } from "@shop/core/telegram-html";
import type { BroadcastAudience, BroadcastStartBody, BroadcastTestBody, ShopLang } from "./types";
import { LOCALES } from "@shop/core/i18n";
import { LANG_SHORT } from "@/lib/shop-lang";

/** Telegram refuses longer messages (the backend checks the same). */
export const MAX_LEN = 4096;

/** Telegram: подпись под картинкой не длиннее 1024; длиннее — картинка и отдельное сообщение. */
export const CAPTION_LIMIT = 1024;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Картинка, уже загруженная на сервер: `photoId` идёт в тест / рассылку. */
export interface BroadcastPhoto {
  photoId: string;
  /** Object URL локального файла — для предпросмотра. */
  previewUrl: string;
  name: string;
}

export type TextKey = "main" | ShopLang;
export type Texts = Record<TextKey, string>;
export const EMPTY_TEXTS: Texts = { main: "", uk: "", ru: "", en: "" };

export const TEXT_TABS: { value: TextKey; label: string }[] = [
  { value: "main", label: "Основной" },
  ...LOCALES.map((l) => ({ value: l, label: LANG_SHORT[l] })),
];

export const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all: "Все",
  active: "С заказами",
  inactive: "Без заказов",
  premium: "Premium",
};

export const DEFAULT_BUTTON = "🛍 Открыть магазин";

/** Поля формы рассылки: тексты — плоско (`main`, `uk`, `ru`, `en`), остальное — как в черновике. */
export interface ComposeValues extends Texts {
  audience: BroadcastAudience;
  lang: ShopLang | "";
  withButton: boolean;
  buttonText: string;
  /** Telegram ID получателя теста, введённый руками (в черновик не попадает). */
  manualId: string;
}

export const EMPTY_COMPOSE: ComposeValues = {
  ...EMPTY_TEXTS,
  audience: "all",
  lang: "",
  withButton: true,
  buttonText: "",
  manualId: "",
};

export function textsOf(v: Texts): Texts {
  return { main: v.main, uk: v.uk, ru: v.ru, en: v.en };
}

export function hasAnyText(texts: Texts): boolean {
  return Object.values(texts).some((t) => t.trim());
}

/**
 * Every filled version must be valid HTML and fit the limit — Telegram rejects the whole
 * message on one bad tag, and a broadcast would only report it as N failed sends.
 */
export function textProblems(texts: Texts): string[] {
  const out: string[] = [];
  for (const t of TEXT_TABS) {
    const v = texts[t.value];
    if (!v.trim()) continue;
    const tag = t.value === "main" ? "" : `${t.label}: `;
    if (v.length > MAX_LEN) out.push(`${tag}длиннее ${MAX_LEN} символов (${v.length})`);
    const html = validateTelegramHtml(v);
    if (html.length) out.push(tag + html[0].message);
  }
  return out;
}

export function startBody(v: ComposeValues, photoId?: string): BroadcastStartBody {
  return {
    text: v.main,
    textUk: v.uk.trim() || undefined,
    textRu: v.ru.trim() || undefined,
    textEn: v.en.trim() || undefined,
    audience: v.audience,
    lang: v.lang,
    withButton: v.withButton,
    buttonText: v.buttonText.trim() || undefined,
    photoId,
  };
}

/** Получатель теста: id из поля или из выбранного в списке; `null` — не указан или не число. */
export function testRecipient(manualId: string, pickedId: number | null): number | null {
  const raw = manualId.trim() || (pickedId != null ? String(pickedId) : "");
  const id = Number(raw);
  if (!raw || !id || Number.isNaN(id)) return null;
  return id;
}

export function testBody(text: string, id: number | undefined, v: Pick<ComposeValues, "withButton" | "buttonText">, photoId?: string): BroadcastTestBody {
  return { text, telegramUserId: id, withButton: v.withButton, buttonText: v.buttonText.trim() || undefined, photoId };
}

/** Какие языковые версии заполнены (для подтверждения). */
export function filledVersions(texts: Texts): ShopLang[] {
  return LOCALES.filter((l) => texts[l].trim());
}

/** Короткий текст без тегов для строки истории. */
export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Первая проблема каждой заполненной версии — чтобы пометить вкладку языка. */
export function problemByKey(texts: Texts): Partial<Record<TextKey, string>> {
  const out: Partial<Record<TextKey, string>> = {};
  for (const t of TEXT_TABS) {
    const v = texts[t.value];
    if (!v.trim()) continue;
    const first = v.length > MAX_LEN ? `длиннее ${MAX_LEN} символов (${v.length})` : validateTelegramHtml(v)[0]?.message;
    if (first) out[t.value] = first;
  }
  return out;
}

/** Доля лимита, с которой счётчик символов начинает «краснеть». */
const WARN_SHARE = 0.9;

export type CounterTone = "ok" | "warn" | "danger";

export function counterTone(length: number, limit: number): CounterTone {
  if (length > limit) return "danger";
  return length >= limit * WARN_SHARE ? "warn" : "ok";
}

/** Лимит счётчика: с картинкой — подпись, иначе целое сообщение. */
export function counterLimit(withPhoto: boolean): number {
  return withPhoto ? CAPTION_LIMIT : MAX_LEN;
}

export interface BlockInput {
  texts: Texts;
  audienceCount: number;
  running: boolean;
}

/** Почему «Разослать» неактивна (пусто — можно слать). Порядок: что чинить в первую очередь. */
export function blockReason({ texts, audienceCount, running }: BlockInput): string {
  if (running) return "Уже идёт рассылка";
  if (!texts.main.trim()) return "Нет основного текста";
  const bad = problemByKey(texts);
  const key = TEXT_TABS.map((t) => t.value).find((k) => bad[k]);
  if (key) return key === "main" ? `Ошибка в основном тексте: ${bad[key]}` : `Ошибка в ${key.toUpperCase()}: ${bad[key]}`;
  if (audienceCount === 0) return "Аудитория пуста";
  return "";
}
