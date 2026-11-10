/**
 * Строка «Автоперевод» на экране «Переводы»: что делает фоновый перевод (бэкенд AutoTranslation, DeepL) —
 * выключен, работает, упёрся в лимит месяца. Чистая логика.
 */
import { formatNumber } from "@shop/core/money";
import type { TrAutoStatus } from "../api";

export type AutoTone = "ok" | "warn" | "off";

export interface AutoLine {
  tone: AutoTone;
  text: string;
  /** Подробности — в подсказку. */
  detail?: string;
}

const fmt = (n: number) => formatNumber(n);

/** «Ошибка QUOTA: …» от бэкенда → человеческая фраза. */
function errorText(error: string): string {
  if (error.startsWith("QUOTA")) return "закончился бесплатный лимит месяца — новые тексты ждут следующего месяца";
  if (error.startsWith("AUTH")) return "DeepL не принял ключ — проверьте DEEPL_API_KEY на сервере";
  return "DeepL сейчас не отвечает — повторит сам через пару минут";
}

export function autoLine(s: TrAutoStatus): AutoLine {
  if (!s.configured) {
    return { tone: "off", text: "Автоперевод выключен: на сервере не задан ключ DeepL (DEEPL_API_KEY)." };
  }
  if (!s.enabled) return { tone: "off", text: "Автоперевод выключен настройкой TRANSLATIONS_AUTO_ENABLED." };
  const month = s.used != null && s.limit != null ? `за месяц ${fmt(s.used)} из ${fmt(s.limit)} символов` : null;
  const run = s.lastRun;
  if (run?.error) {
    return { tone: "warn", text: `Автоперевод: ${errorText(run.error)}.`, detail: [month, run.error].filter(Boolean).join(" · ") };
  }
  const parts = ["Автоперевод включён: новые и изменённые русские тексты переводятся сами через пару минут"];
  if (month) parts.push(month);
  if (run && run.charsWaiting > 0) parts.push(`ждут очереди ${fmt(run.charsWaiting)} символов`);
  if (run && run.rejected > 0) parts.push(`${run.rejected} не прошли проверку — остались в «Нужно перевести»`);
  return { tone: run && run.rejected > 0 ? "warn" : "ok", text: `${parts.join(" · ")}.` };
}
