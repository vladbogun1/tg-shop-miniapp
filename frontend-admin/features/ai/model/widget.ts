import type { AiWidgetData } from "../api";
import { uahFromMinor } from "./format";

/** Строка виджета на дашборде: финансисту — расход и «ждёт проверки», админу — можно ли запускать. */
export function widgetLine(w: AiWidgetData): string {
  const parts: string[] = [];
  if (w.monthSpentMinor != null && w.monthLimitMinor != null) {
    parts.push(`Расход ${uahFromMinor(w.monthSpentMinor)} из ${uahFromMinor(w.monthLimitMinor)}`);
  } else {
    parts.push(w.canRun ? "ИИ можно запускать" : w.configured && w.enabled ? "ИИ сейчас остановлен" : "ИИ выключен");
  }
  if (w.review > 0) parts.push(`ждёт проверки ${w.review}`);
  if (w.problems > 0) parts.push(`проблем ${w.problems}`);
  return parts.join(" · ");
}

/**
 * Та же строка для телефона (320–375 px): без слов «Расход» и «ИИ можно запускать», числа впереди —
 * «0 ₴ из 420 ₴ · ждёт 1 · проблем 1» влезает в чип вместе со значком ✦. Полная строка — в подсказке и на ПК.
 */
export function widgetShort(w: AiWidgetData): string {
  const parts: string[] = [];
  if (w.monthSpentMinor != null && w.monthLimitMinor != null) {
    parts.push(`${uahFromMinor(w.monthSpentMinor)} из ${uahFromMinor(w.monthLimitMinor)}`);
  } else if (!w.canRun) {
    parts.push(w.configured && w.enabled ? "остановлен" : "выключен");
  }
  if (w.review > 0) parts.push(`ждёт ${w.review}`);
  if (w.problems > 0) parts.push(`проблем ${w.problems}`);
  return parts.length ? parts.join(" · ") : "ИИ";
}

/** Виджет нечего показывать: ИИ не настроен и ничего не ждёт. */
export function widgetHidden(w: AiWidgetData | undefined): boolean {
  return !w || (!w.configured && w.review === 0 && w.problems === 0 && w.running === 0);
}

/** Чип над доской в виде остальных «Сегодня»: подпись капсом («Расход ИИ» / «ИИ») + короткое значение. */
export function widgetChip(w: AiWidgetData): { label: string; value: string } {
  const money = w.monthSpentMinor != null && w.monthLimitMinor != null;
  const short = widgetShort(w);
  return { label: money ? "Расход ИИ" : "ИИ", value: short === "ИИ" ? "можно запускать" : short };
}
