"use client";

import { useQuery } from "@tanstack/react-query";
import { Server } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { QueryState } from "@/components/ui/QueryState";
import { settingsApi } from "@/lib/settings";
import { formatDateTime } from "./draft";
import { PanelHeader } from "./PanelHeader";

/** «Система» — read-only facts the owner otherwise only learns over ssh. */
export function SystemPanel() {
  const q = useQuery({ queryKey: ["settings-system"], queryFn: settingsApi.system });
  const s = q.data;
  const lastSync = formatDateTime(s?.npLastSyncAt);
  const lastError = formatDateTime(s?.npLastErrorAt);
  // Show the error only if it is newer than the last good sync.
  const errorIsLatest =
    !!s?.npLastErrorAt && (!s.npLastSyncAt || new Date(s.npLastErrorAt) > new Date(s.npLastSyncAt));

  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={Server} title="Система" description="Только для просмотра." />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        {s && (
          <dl className="flex min-w-0 flex-col gap-3 text-[13px]">
            <Row label="Версия">
              <span className="font-mono">{s.version ?? "—"}</span>
              {s.buildTime && (
                <span className="block text-[12px] text-[var(--text-faint)]">сборка {formatDateTime(s.buildTime)}</span>
              )}
            </Row>
            <Row label="Часовой пояс">{s.timezone ?? "—"}</Row>
            <Row label="Синк Новой Почты">
              <span className="flex flex-wrap items-center gap-2">
                {lastSync ?? "нет данных"}
                {!s.npAutoSync && <Badge tone="warn">Ночной синк выключен</Badge>}
              </span>
              {s.npLastSyncSummary && (
                <span className="block text-[12px] text-[var(--text-faint)]">{s.npLastSyncSummary}</span>
              )}
              {errorIsLatest && (
                <span className="mt-1 block break-words text-[12px] text-[var(--danger)]">
                  Ошибка {lastError}: {s.npLastError ?? "неизвестно"}
                </span>
              )}
            </Row>
            <Row label="Отделений в базе">{s.npWarehouses != null ? s.npWarehouses.toLocaleString("ru-RU") : "—"}</Row>
          </dl>
        )}
      </QueryState>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b-2 border-dashed border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-words text-[var(--text)]">{children}</dd>
    </div>
  );
}
