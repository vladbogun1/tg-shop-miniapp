"use client";

import { useState } from "react";
import { ChevronDown, Megaphone } from "lucide-react";
import { formatDateTime } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { audienceLabel, broadcastNumbers, broadcastStatus } from "../model/broadcast";
import { errorLabel, UNREACHABLE } from "../model/labels";
import type { BroadcastSummary } from "../model/types";
import { useActivityFeed, useBroadcastSummaries } from "../queries";
import { EventList } from "./EventList";
import type { RowActions } from "./use-row-actions";

/** Вкладка «Рассылки»: каждая рассылка с итогом доставки и причинами. */
export function Broadcasts({ actions }: { actions: RowActions }) {
  const q = useBroadcastSummaries();
  const list = q.data ?? [];
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={() => q.refetch()} loadingLabel="Загружаем рассылки">
      {list.length === 0 ? (
        <EmptyState icon={Megaphone} title="Рассылок ещё не было" description="Отправьте первую на странице «Рассылки»." />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((s) => (
            <BroadcastCard key={s.broadcast.id} s={s} actions={actions} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

type Only = "" | "FAILED" | "OK";

function BroadcastCard({ s, actions }: { s: BroadcastSummary; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const [only, setOnly] = useState<Only>("");
  const b = s.broadcast;
  const n = broadcastNumbers(s);
  const status = broadcastStatus(b.status);

  return (
    <div className="card min-w-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[13px] font-bold text-[var(--text)]">Рассылка №{b.id}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="tabular text-[12px] text-[var(--text-muted)]">{formatDateTime(b.startedAt)}</span>
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-faint)]">
            {b.adminName ?? "—"} · аудитория: {audienceLabel(b.audience)}
            {b.lang ? ` · язык ${b.lang.toUpperCase()}` : ""}
          </div>
          <p className="mt-2 line-clamp-2 break-words text-[13px] text-[var(--text-muted)]">{n.preview}</p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-4 text-right">
          <Num label="Всего" value={b.total} />
          <Num label="Доставлено" value={n.delivered} tone="ok" />
          <Num label="Не доставлено" value={n.notDelivered} tone={n.notDelivered > 0 ? "danger" : undefined} />
        </div>
      </div>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
        <div className="h-full bg-[var(--ok)]" style={{ width: `${n.pctOk}%` }} />
        <div className="h-full bg-[#F87171]" style={{ width: `${n.pctBad}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {n.reasons.map(([code, count]) => (
            <Badge key={code} tone={UNREACHABLE.has(code) ? "warn" : "danger"}>
              {errorLabel(code)}: {count}
            </Badge>
          ))}
          {n.journaled === 0 && (
            <span className="text-[12px] text-[var(--text-faint)]">
              Подробностей по получателям нет — рассылка была до появления журнала.
            </span>
          )}
        </div>
        {n.journaled > 0 && (
          <Button size="sm" variant="surface" icon={<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />} onClick={() => setOpen(!open)}>
            Получатели
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          <SegmentedControl<Only>
            size="sm"
            options={[
              { value: "", label: "Все" },
              { value: "FAILED", label: "Не доставлено" },
              { value: "OK", label: "Доставлено" },
            ]}
            value={only}
            onChange={setOnly}
          />
          <div className="mt-2">
            <Recipients group={s.group} result={only} actions={actions} />
          </div>
        </div>
      )}
    </div>
  );
}

function Num({ label, value, tone }: { label: string; value: number; tone?: "ok" | "danger" }) {
  return (
    <div>
      <div
        className={cn(
          "tabular font-display text-[18px] font-bold",
          tone === "ok" ? "text-[var(--ok)]" : tone === "danger" ? "text-[#F87171]" : "text-[var(--text)]"
        )}
      >
        {value}
      </div>
      <div className="text-[11px] text-[var(--text-faint)]">{label}</div>
    </div>
  );
}

function Recipients({ group, result, actions }: { group: string; result: string; actions: RowActions }) {
  const q = useActivityFeed({ group, result: result || undefined });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={() => q.refetch()} loadingLabel="Загружаем получателей">
      {rows.length === 0 ? (
        <p className="py-3 text-[13px] text-[var(--text-faint)]">Никого.</p>
      ) : (
        <>
          <EventList rows={rows} actions={actions} compact />
          {q.hasNextPage && (
            <div className="mt-2 text-right">
              <Button size="sm" variant="surface" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                Ещё
              </Button>
            </div>
          )}
        </>
      )}
    </QueryState>
  );
}
