"use client";

import { cn } from "@/lib/cn";
import { useActivityStats } from "../queries";
import { SOURCE_ORDER, sourceLabel } from "../model/labels";
import { sourceIcon } from "./source-icon";

/** Счётчики за 24 часа по источникам; клик — фильтр ленты по источнику / только ошибки. */
export function StatsStrip({ active, onPick }: { active: string; onPick: (source: string, failedOnly: boolean) => void }) {
  const q = useActivityStats();
  const stats = q.data ?? {};
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {SOURCE_ORDER.map((s) => {
        const Icon = sourceIcon(s);
        const st = stats[s] ?? {};
        const failed = st.failed ?? 0;
        return (
          <div
            key={s}
            className={cn(
              "card flex min-w-0 flex-col gap-1 p-3 transition-colors",
              active === s && "!border-[var(--accent)]"
            )}
          >
            <button
              type="button"
              onClick={() => onPick(s, false)}
              className="hit flex items-center gap-2 text-left"
              title="Показать только этот источник"
            >
              <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <span className="font-display truncate text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                {sourceLabel(s)}
              </span>
            </button>
            <span className="tabular font-display text-[20px] font-bold leading-tight text-[var(--text)]">
              {q.isLoading ? "…" : (st.total ?? 0)}
            </span>
            {failed > 0 ? (
              <button
                type="button"
                onClick={() => onPick(s, true)}
                className="hit tabular self-start text-left text-[11.5px] font-semibold text-[#F87171] hover:underline"
                title="Показать только ошибки"
              >
                {s === "BOT" ? "не доставлено" : "ошибок"}: {failed}
              </button>
            ) : (
              <span className="text-[11.5px] text-[var(--text-faint)]">без ошибок</span>
            )}
            <span className="text-[11px] text-[var(--text-faint)]">за 24 часа</span>
          </div>
        );
      })}
    </div>
  );
}
