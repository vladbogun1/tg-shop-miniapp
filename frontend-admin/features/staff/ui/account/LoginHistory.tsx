import { Badge } from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/orders";
import type { AdminLoginEntry } from "../../api";
import { loginMethodLabel, loginResult, SECOND_FACTOR } from "../../model/login-log";

export function LoginHistory({ entries }: { entries: AdminLoginEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-[13px] text-[var(--text-muted)]">Пока пусто.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-[var(--line)]" aria-label="История входов">
      {entries.map((e) => {
        const r = loginResult(e.result);
        const place = [e.city, e.country].filter(Boolean).join(", ") || "место неизвестно";
        return (
          <li key={e.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-2 sm:w-[190px] sm:shrink-0">
              <Badge tone={r.tone} dot>
                {r.label}
              </Badge>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-[var(--text)]">
                <span className="font-semibold">{place}</span>
                <span className="text-[var(--text-faint)]">·</span>
                <span>{e.device || "устройство неизвестно"}</span>
                {e.newDevice && <Badge tone="warn">Новое устройство</Badge>}
                {e.newCity && <Badge tone="warn">Новый город</Badge>}
              </div>
              <div className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                {loginMethodLabel(e.method)}
                {e.secondFactor ? ` + ${SECOND_FACTOR[e.secondFactor] ?? e.secondFactor}` : ""}
                {e.ip ? ` · IP ${e.ip}` : ""}
              </div>
            </div>
            <time dateTime={e.at} className="shrink-0 text-[12.5px] tabular-nums text-[var(--text-muted)]">
              {formatDateTime(e.at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
