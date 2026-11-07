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
