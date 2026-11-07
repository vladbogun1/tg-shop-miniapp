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

/** Виджет нечего показывать: ИИ не настроен и ничего не ждёт. */
export function widgetHidden(w: AiWidgetData | undefined): boolean {
  return !w || (!w.configured && w.review === 0 && w.problems === 0 && w.running === 0);
}
