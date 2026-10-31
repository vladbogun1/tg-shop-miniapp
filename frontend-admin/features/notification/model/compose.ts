import { validateTelegramHtml } from "@shop/core/telegram-html";
import type { BroadcastAudience, BroadcastStartBody, BroadcastTestBody, ShopLang } from "./types";

/** Telegram refuses longer messages (the backend checks the same). */
export const MAX_LEN = 4096;

export type TextKey = "main" | ShopLang;
export type Texts = Record<TextKey, string>;
export const EMPTY_TEXTS: Texts = { main: "", uk: "", ru: "", en: "" };

export const TEXT_TABS: { value: TextKey; label: string }[] = [
  { value: "main", label: "Основной" },
  { value: "uk", label: "UA" },
  { value: "ru", label: "RU" },
  { value: "en", label: "EN" },
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

export function startBody(v: ComposeValues): BroadcastStartBody {
  return {
    text: v.main,
    textUk: v.uk.trim() || undefined,
    textRu: v.ru.trim() || undefined,
    textEn: v.en.trim() || undefined,
    audience: v.audience,
    lang: v.lang,
    withButton: v.withButton,
    buttonText: v.buttonText.trim() || undefined,
  };
}

/** Получатель теста: id из поля или из выбранного в списке; `null` — не указан или не число. */
export function testRecipient(manualId: string, pickedId: number | null): number | null {
  const raw = manualId.trim() || (pickedId != null ? String(pickedId) : "");
  const id = Number(raw);
  if (!raw || !id || Number.isNaN(id)) return null;
  return id;
}

export function testBody(text: string, id: number | undefined, v: Pick<ComposeValues, "withButton" | "buttonText">): BroadcastTestBody {
  return { text, telegramUserId: id, withButton: v.withButton, buttonText: v.buttonText.trim() || undefined };
}

/** Какие языковые версии заполнены (для подтверждения). */
export function filledVersions(texts: Texts): ShopLang[] {
  return (["uk", "ru", "en"] as ShopLang[]).filter((l) => texts[l].trim());
}

/** Короткий текст без тегов для строки истории. */
export function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}
