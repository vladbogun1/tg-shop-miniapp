import { uahFromCents, usdFromCents } from "./format";

/**
 * «История изменений» настроек «ИИ»: из записей журнала о сохранении настроек (одна запись — одно «Сохранить»,
 * в «details» правки через «; », каждая начинается с подписи поля в ёлочках) берём только правки полей «ИИ».
 */
export interface AuditLike {
  id: number;
  createdAt: string;
  adminName?: string | null;
  details?: string | null;
}

export interface AiSettingsChange {
  id: number;
  at: string;
  who: string;
  changes: string[];
}

export function aiSettingsChanges(entries: readonly AuditLike[], labels: readonly string[], limit = 20): AiSettingsChange[] {
  const ours = labels.map((l) => `«${l}»:`);
  const out: AiSettingsChange[] = [];
  for (const e of entries) {
    const changes = (e.details ?? "").split("; ").filter((part) => ours.some((p) => part.startsWith(p)));
    if (changes.length) out.push({ id: e.id, at: e.createdAt, who: e.adminName || "—", changes });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Денежные поля журнал пишет в единицах хранения — центах (««Лимит в месяц»: 1000 → 2500»). Здесь каждое число правки
 * такого поля показывается как в самом поле: доллары и рядом гривны по нынешнему курсу («$10 ≈ 420 ₴»; курса нет —
 * только доллары). Правки других полей не меняются.
 */
export function moneyChange(change: string, moneyLabels: readonly string[], rateKopecks: number | null): string {
  const prefix = moneyLabels.map((l) => `«${l}»:`).find((p) => change.startsWith(p));
  if (!prefix) return change;
  const values = change.slice(prefix.length).replace(/\d+/g, (n) => {
    const cents = Number(n);
    if (cents === 0) return "без лимита";
    return rateKopecks ? `${usdFromCents(cents)} ≈ ${uahFromCents(cents, rateKopecks)}` : usdFromCents(cents);
  });
  return prefix + values;
}
