"use client";

import { useConfirm } from "@shop/ui/confirm";
import { Button } from "@shop/ui/admin-button";
import { OctagonX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { QueryState } from "@/components/ui/QueryState";
import { cn } from "@/lib/cn";
import type { AiMoney, AiState } from "../api";
import { uahFromMinor, usdFromMicro, usedPercent } from "../model/format";
import { useAiState, useStopRunning } from "../queries";

const WARN_AT = 80;

/** «Состояние»: ключ задан, потрачено сегодня и в месяце против лимитов, сколько задач идёт, «Остановить всё». */
export function AiStateBlock() {
  const q = useAiState();
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка состояния ИИ">
      {q.data && <StateBody s={q.data} />}
    </QueryState>
  );
}

function StateBody({ s }: { s: AiState }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={s.configured ? "ok" : "danger"} dot>
          {s.configured ? "Ключ задан" : "Нет ключа"}
        </Badge>
        <Badge tone={s.enabled ? "ok" : "neutral"}>{s.enabled ? "Включён" : "Выключен"}</Badge>
        {s.model && <span className="font-mono text-[12px] text-[var(--text-faint)]">{s.model}</span>}
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Meter title="Сегодня" money={s.day} />
        <Meter title="В этом месяце" money={s.month} reserve={s.reservesMicroUsd} />
      </div>
      {s.lostRows > 0 && (
        <p className="rounded-[var(--r-md)] border border-[var(--warn)] p-3 text-[12px] leading-snug text-[var(--text-muted)]">
          В журнале расхода есть записи без суммы ({s.lostRows}). Они учтены в лимите по запасу, пока их не разберут.
        </p>
      )}
      <RunningRow running={s.running} />
    </div>
  );
}

function Meter({ title, money, reserve = 0 }: { title: string; money: AiMoney; reserve?: number }) {
  const unlimited = money.limitMicroUsd <= 0;
  const pct = usedPercent(money.spentMicroUsd + reserve, money.limitMicroUsd);
  const hot = !unlimited && pct >= WARN_AT;
  return (
    <div className="min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="field-label">{title}</span>
        <span className="text-[12px] text-[var(--text-faint)]">{unlimited ? "без лимита" : `${pct}%`}</span>
      </div>
      <div className="mt-1 text-[18px] font-semibold text-[var(--ink)]">
        {usdFromMicro(money.spentMicroUsd)}
        <span className="ml-2 text-[12px] font-normal text-[var(--text-muted)]">≈ {uahFromMinor(money.spentMinor)}</span>
      </div>
      {!unlimited && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={`${title}: израсходовано ${pct}% лимита`}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]"
        >
          <div className={cn("h-full rounded-full", hot ? "bg-[var(--warn)]" : "bg-[var(--accent)]")} style={{ width: `${pct}%` }} />
        </div>
      )}
      {!unlimited && <div className="mt-1.5 text-[12px] text-[var(--text-muted)]">из {usdFromMicro(money.limitMicroUsd)}</div>}
      {reserve > 0 && <div className="mt-1 text-[12px] text-[var(--text-faint)]">в работе зарезервировано {usdFromMicro(reserve)}</div>}
    </div>
  );
}

function RunningRow({ running }: { running: number }) {
  const confirm = useConfirm();
  const stop = useStopRunning();
  const ask = async () => {
    const ok = await confirm({
      title: "Остановить все задачи ИИ?",
      message: "Идущие задачи остановятся перед следующим шагом, ожидающие в очереди будут сняты. Уже потраченное не вернётся.",
      confirmLabel: "Остановить всё",
      danger: true,
    });
    if (ok) stop.mutate();
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[13px] text-[var(--text-muted)]">{running === 0 ? "Сейчас задач нет" : `Задач в работе: ${running}`}</span>
      <Button variant="danger" size="sm" icon={<OctagonX className="h-4 w-4" />} loading={stop.isPending} onClick={() => void ask()}>
        Остановить всё
      </Button>
    </div>
  );
}
