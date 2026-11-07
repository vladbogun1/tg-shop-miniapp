import type { AiMetricsRow, AiMetricsSummary } from "../api";
import { uahFromMinor } from "./format";

/** Цифры вкладки «ИИ» в метриках, как их читает владелец: подписи и подсказки. Чистая логика, без React. */

const percent = (n: number | null | undefined) => (n == null ? "—" : `${n} %`);

/** «Потрачено 19 из 420 ₴ · прогноз на месяц 310 ₴». */
export function monthLine(m: AiMetricsSummary["month"]): string {
  const base = `Потрачено ${uahFromMinor(m.spentMinor)} из ${uahFromMinor(m.limitMinor)}`;
  return m.forecastMinor != null ? `${base} · прогноз на месяц ${uahFromMinor(m.forecastMinor)}` : base;
}

const MANUAL_REASON: Record<string, string> = {
  CHOICE: "по выбору",
  LIMIT: "из-за лимита",
  FAILURE: "после сбоя ИИ",
  OFF: "ИИ выключен",
};

export interface Tile {
  label: string;
  value: string;
  hint: string;
}

export function shareTile(s: AiMetricsSummary["share"]): Tile {
  const reasons = Object.entries(s.manualBy)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${MANUAL_REASON[k] ?? k}: ${n}`)
    .join(", ");
  const manual = s.manual > 0 ? `вручную ${s.manual}${reasons ? ` (${reasons})` : ""}` : "вручную 0";
  return {
    label: "Доля встроенного ИИ",
    value: s.builtin + s.manual === 0 ? "—" : percent(s.builtinPercent),
    hint: `встроенный ${s.builtin}, ${manual}`,
  };
}

/** Две цифры «без правок»: поля и карточки целиком, плюс сколько результатов никто не открыл. */
export function noEditsTile(n: AiMetricsSummary["noEdits"]): Tile {
  const open = n.notOpened > 0 ? `, не открыто ${n.notOpened}` : "";
  return {
    label: "Принято без правок",
    value: n.decided === 0 ? "—" : percent(n.fieldsPercent),
    hint:
      n.decided === 0
        ? `решений пока нет${open}`
        : `полей; карточек целиком ${percent(n.cardsPercent)} из ${n.decided}${open}`,
  };
}

const WASTE_LABEL: Record<string, string> = {
  NODATA: "не нашёл данных",
  FAILED: "сбой или неразобранный ответ",
  LOST: "потеряно при перезапуске",
  RETRIED: "повтор после отклонения",
  REJECTED: "отклонено админом",
  CANCELED: "остановлено",
};

export function wasteLabel(key: string): string {
  return WASTE_LABEL[key] ?? key;
}

export function wasteTile(m: Pick<AiMetricsSummary, "wastedMinor" | "waste">): Tile {
  const counted = m.waste.filter((w) => w.counted && w.jobs > 0);
  return {
    label: "Зря потрачено",
    value: uahFromMinor(m.wastedMinor),
    hint: counted.length ? counted.map((w) => `${wasteLabel(w.key)}: ${w.jobs}`).join(", ") : "ничего",
  };
}

export function waitingTile(w: AiMetricsSummary["waiting"]): Tile {
  const old = w.stale > 0 ? `, старше двух недель: ${w.stale}` : "";
  return {
    label: "Ждёт проверки",
    value: String(w.count),
    hint: w.count === 0 ? "всё разобрано" : `самому старому ${w.oldestDays ?? 0} дн.${old}`,
  };
}

export function fastApplyText(f: AiMetricsSummary["fastApply"]): string | null {
  if (f.of === 0) return null;
  return `Применено не глядя (меньше 5 секунд): ${f.count} из ${f.of} крупных результатов`;
}

export interface DayPoint {
  day: string;
  costMinor: number;
  accepted: number;
}

/** «2026-11-07» → «07.11»: подпись под столбцом. */
export function dayLabel(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}

export function dayPoints(rows: AiMetricsRow[]): DayPoint[] {
  return rows.map((r) => ({ day: r.key, costMinor: r.costMinor, accepted: r.accepted }));
}
