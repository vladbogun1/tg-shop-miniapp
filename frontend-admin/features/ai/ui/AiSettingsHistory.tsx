"use client";

import { formatDateTime } from "@shop/core/time";
import { QueryState } from "@/components/ui/QueryState";
import { aiSettingsChanges, moneyChange } from "../model/settings-history";
import { useAiSettingsHistory } from "../queries";

interface Props {
  labels: readonly string[];
  /** Подписи денежных полей (лимиты): их центы из журнала показываются долларами с гривнами, как в самих полях. */
  moneyLabels: readonly string[];
  /** Курс в копейках за доллар; null — только доллары. */
  rateKopecks: number | null;
}

/** Последние правки настроек «ИИ» из журнала: когда, кто, что было → что стало. */
export function AiSettingsHistory({ labels, moneyLabels, rateKopecks }: Props) {
  const q = useAiSettingsHistory();
  const rows = q.data ? aiSettingsChanges(q.data, labels) : [];
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка истории">
      {q.data && rows.length === 0 && <p className="text-[13px] text-[var(--text-muted)]">Настройки ИИ ещё не меняли.</p>}
      {rows.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-3" aria-label="История изменений настроек ИИ">
          {rows.map((r) => (
            <li key={r.id} className="min-w-0 text-[12.5px] leading-snug">
              <div className="text-[var(--text-faint)]">
                {formatDateTime(r.at)} · {r.who}
              </div>
              {r.changes.map((c) => (
                <div key={c} className="break-words text-[var(--text)]">
                  {moneyChange(c, moneyLabels, rateKopecks)}
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
