"use client";

/**
 * «Журнал упаковки»: последние ТТН — что советовали, во что упаковали, что намерила Новая Почта против нашего.
 * Карточки (удобно на телефоне), фильтр «только расхождения».
 */
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatShortDateTime } from "@shop/core/time";
import { Modal } from "@shop/ui/overlay";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { remeasureText } from "../../model/packing";
import type { PackingJournalRow } from "../../model/types";
import { JOURNAL_DAYS, usePackingJournal } from "../../queries-packing";
import { ShipmentStageBadge } from "../parts";

function BoxLine({ r }: { r: PackingJournalRow }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px]">
      <span className="min-w-0 break-words text-[var(--text-muted)]">
        {r.boxSuggested ?? "без совета"}
        {r.boxSuggestedSource && <span className="text-[var(--text-faint)]"> ({r.boxSuggestedSource})</span>}
      </span>
      <ArrowRight aria-label="упаковали в" className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
      <span className={cn("min-w-0 break-words font-semibold", r.boxLabel ? "text-[var(--text)]" : "text-[var(--warn)]")}>
        {r.boxLabel ?? "не подтверждена"}
      </span>
    </div>
  );
}

function Row({ r }: { r: PackingJournalRow }) {
  const np = remeasureText(r, r);
  return (
    <li className="card-2 flex min-w-0 flex-col gap-1.5 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tabular font-bold text-[var(--ink)]">#{r.shortId}</span>
        {r.ttn && <span className="tabular text-[12.5px] text-[var(--text-muted)]">{r.ttn}</span>}
        <ShipmentStageBadge stage={r.stage} />
        {r.mismatch && <Badge tone="warn">другая коробка</Badge>}
        {r.remeasured && <Badge tone="danger">НП перемеряла</Badge>}
        {r.createdAt && <span className="ml-auto text-[11.5px] text-[var(--text-faint)]">{formatShortDateTime(r.createdAt)}</span>}
      </div>
      {r.goods && r.goods.length > 0 && <p className="min-w-0 break-words text-[12.5px] text-[var(--text-muted)]">{r.goods.join("; ")}</p>}
      <BoxLine r={r} />
      {np && <p className={cn("min-w-0 break-words text-[12.5px]", np.differs ? "font-semibold text-[var(--danger-ink)]" : "text-[var(--text-muted)]")}>{np.text}</p>}
      {r.boxConfirmedAt && (
        <p className="text-[11.5px] text-[var(--text-faint)]">
          Упаковано{r.boxConfirmedBy ? ` · ${r.boxConfirmedBy}` : ""}, {formatShortDateTime(r.boxConfirmedAt)}
        </p>
      )}
    </li>
  );
}

export function PackingJournalModal({ onClose }: { onClose: () => void }) {
  const q = usePackingJournal(JOURNAL_DAYS);
  const [onlyOff, setOnlyOff] = useState(false);
  const rows = (q.data?.rows ?? []).filter((r) => !onlyOff || r.mismatch || r.remeasured);
  return (
    <Modal open onClose={onClose} size="lg" title="Журнал упаковки">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-[var(--text-muted)]">ТТН за {q.data?.days ?? JOURNAL_DAYS} дней: советовали → упаковали, замер НП против нашего</span>
          <Toggle checked={onlyOff} onChange={setOnlyOff} label="Только расхождения" />
        </div>
        {q.isError && <p className="text-[13px] text-[var(--danger-ink)]">Не удалось загрузить журнал.</p>}
        {q.isLoading && <p className="text-[13px] text-[var(--text-muted)]">Загружаем…</p>}
        {q.data && rows.length === 0 && (
          <p className="text-[13px] text-[var(--text-muted)]">{onlyOff ? "Расхождений нет." : "ТТН за этот срок нет."}</p>
        )}
        <ul className="flex min-w-0 flex-col gap-2">
          {rows.map((r) => (
            <Row key={`${r.orderId}-${r.ttn}`} r={r} />
          ))}
        </ul>
      </div>
    </Modal>
  );
}
