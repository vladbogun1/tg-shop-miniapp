"use client";

import { Server } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { QueryState } from "@/components/ui/QueryState";
import { formatIsoOrNull } from "@/lib/format-iso";
import { PanelHeader } from "@/components/ui/PanelHeader";
import type { SystemInfo } from "../api";
import { useSystemQuery } from "../queries";
import { formatNumber } from "@shop/core/money";

/** «Система» — read-only facts the owner otherwise only learns over ssh. */
export function SystemPanel() {
  const q = useSystemQuery();
  const s = q.data;
  return (
    <section className="panel min-w-0 p-5">
      <PanelHeader icon={Server} title="Система" description="Только для просмотра." />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        {s && (
          <dl className="flex min-w-0 flex-col gap-3 text-[13px]">
            <Row label="Версия">
              <span className="font-mono">{s.version ?? "—"}</span>
              {s.buildTime && (
                <span className="block text-[12px] text-[var(--text-faint)]">сборка {formatIsoOrNull(s.buildTime)}</span>
              )}
            </Row>
            <Row label="Часовой пояс">{s.timezone ?? "—"}</Row>
            <NpSyncRow s={s} />
            <Row label="Отделений в базе">{s.npWarehouses != null ? formatNumber(s.npWarehouses, "ru-RU") : "—"}</Row>
          </dl>
        )}
      </QueryState>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-b border-[var(--line)] pb-3 last:border-b-0 last:pb-0">
      <dt className="field-label !text-[11px] !text-[var(--text-faint)]">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-words text-[var(--text)]">{children}</dd>
    </div>
  );
}

function NpSyncRow({ s }: { s: SystemInfo }) {
  const lastSync = formatIsoOrNull(s.npLastSyncAt);
  const lastError = formatIsoOrNull(s.npLastErrorAt);
  // Show the error only if it is newer than the last good sync.
  const errorIsLatest = !!s.npLastErrorAt && (!s.npLastSyncAt || new Date(s.npLastErrorAt) > new Date(s.npLastSyncAt));
  return (
    <Row label="Синк Новой Почты">
      <span className="flex flex-wrap items-center gap-2">
        {lastSync ?? "нет данных"}
        {!s.npAutoSync && <Badge tone="warn">Ночной синк выключен</Badge>}
      </span>
      {s.npLastSyncSummary && <span className="block text-[12px] text-[var(--text-faint)]">{s.npLastSyncSummary}</span>}
      {errorIsLatest && (
        <span className="mt-1 block break-words text-[12px] text-[var(--danger-ink)]">
          Ошибка {lastError}: {s.npLastError ?? "неизвестно"}
        </span>
      )}
    </Row>
  );
}
