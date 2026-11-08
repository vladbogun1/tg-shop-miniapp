"use client";

import { Button } from "@shop/ui/admin-button";
import { formatDateTime } from "@shop/core/time";
import { Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import type { DraftSummary } from "../../api-drafts";
import { STEPS } from "../../model/drafts/draft";
import { useDrafts } from "../../queries-drafts";
import { Stat } from "../BatchStat";
import { DraftStatusBadge } from "./DraftStatusBadge";

/** Открытые черновики «Поставки с ИИ»: что ещё разбирает ИИ, что ждёт проверки, что не вышло. */
export function DraftList({ onStart }: { onStart: () => void }) {
  const q = useDrafts();
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка черновиков">
      {q.data && q.data.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Черновиков нет"
          description="Приложите накладную — ИИ сам разберёт её в черновик поставки, а вы проверите и примете."
          action={
            <Button variant="accent" icon={<Sparkles className="h-4 w-4" />} onClick={onStart}>
              Из накладной (ИИ)
            </Button>
          }
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          {q.data?.map((d) => (
            <DraftRow key={d.id} d={d} />
          ))}
        </div>
      )}
    </QueryState>
  );
}

function DraftRow({ d }: { d: DraftSummary }) {
  const step = STEPS.find((s) => s.step === d.step)?.label;
  return (
    <Link href={`/preorders/drafts/${d.id}`} className="card card-hover flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3.5">
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-[15px] font-semibold text-[var(--text)]">{d.title ?? `Черновик #${d.id}`}</h3>
          <DraftStatusBadge status={d.status} />
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
          {d.status === "RUNNING" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent)]" />}
          <span className="min-w-0 break-words">
            {d.status === "RUNNING" ? `${step ?? "ИИ работает"}…` : d.status === "FAILED" ? (d.failure ?? "ИИ не справился") : `готов ${formatDateTime(d.readyAt ?? d.updatedAt)}`}
          </span>
        </div>
      </div>
      {d.lines > 0 && (
        <div className="grid w-full grid-cols-3 gap-3 sm:flex sm:w-auto sm:gap-4">
          <Stat label="Строк" value={`${d.lines}`} />
          <Stat label="Новых" value={d.newProducts ? `${d.newProducts}` : "—"} />
          <Stat label="Не решено" value={d.open ? `${d.open}` : "—"} accent={d.open > 0} />
        </div>
      )}
      {d.status === "FAILED" && <Badge tone="danger">откройте, чтобы повторить</Badge>}
    </Link>
  );
}
