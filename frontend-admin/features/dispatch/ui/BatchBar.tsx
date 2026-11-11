"use client";

/**
 * Новая Почта для нескольких заказов: выбрать все / снять, отделение отправки, «Створити ТТН для всіх»,
 * печать этикеток одним PDF и результат последнего пакета. Без галочек работаем со всеми показанными.
 */
import { Check, Truck, X } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Badge } from "@/components/ui/Badge";
import { Chip, LabelPrint, type BatchResult, type LabelFormat, type SenderWarehouse } from "@/features/delivery";

export interface BatchBarProps {
  total: number;
  selected: number;
  toCreate: number;
  toPrintIds: string[];
  staleCount: number;
  format: LabelFormat;
  onFormat: (f: LabelFormat) => void;
  branches: SenderWarehouse[];
  branch: string | null;
  onBranch: (ref: string) => void;
  creating: boolean;
  onAll: () => void;
  onCreate: () => void;
}

function BranchChips({ branches, branch, onBranch }: Pick<BatchBarProps, "branches" | "branch" | "onBranch">) {
  if (branches.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="field-label !text-[11px]">Отправляем из</span>
      {branches.map((w) => (
        <span key={w.ref} title={w.description}>
          <Chip active={branch === w.ref} onClick={() => onBranch(w.ref)}>
            №{w.number}
            {w.cityName ? ` · ${w.cityName}` : ""}
          </Chip>
        </span>
      ))}
    </div>
  );
}

export function BatchBar(p: BatchBarProps) {
  const all = p.selected > 0 && p.selected === p.total;
  return (
    <section className="panel flex min-w-0 flex-col gap-3 p-3 sm:p-4" aria-label="Нова пошта: ТТН для нескольких заказов">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" icon={<Check className="h-4 w-4" />} onClick={p.onAll}>
          {all ? "Снять выбор" : "Выбрать все"}
        </Button>
        <span className="text-[12.5px] text-[var(--text-muted)]">
          {p.selected > 0 ? `Выбрано: ${p.selected} из ${p.total}` : `Нова пошта: ${p.total} · без выбора работаем со всеми`}
        </span>
      </div>
      <BranchChips branches={p.branches} branch={p.branch} onBranch={p.onBranch} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="accent"
          className="max-sm:w-full pointer-coarse:min-h-11"
          loading={p.creating}
          disabled={p.toCreate === 0}
          icon={<Truck className="h-4 w-4" />}
          onClick={p.onCreate}
        >
          Створити ТТН для всіх · {p.toCreate}
        </Button>
        <LabelPrint orderIds={p.toPrintIds} label={`Друк етикеток · ${p.toPrintIds.length}`} format={p.format} onFormat={p.onFormat} />
      </div>
      <p className="text-[12px] leading-snug text-[var(--text-faint)]">
        ТТН создаётся только для заказов без неё; неоплаченные онлайн пропускаются с пояснением. Этикетки — одним PDF.
        {p.staleCount > 0 && ` Устаревших ТТН: ${p.staleCount} — их не печатаем, пересоздайте.`}
      </p>
    </section>
  );
}

export function BatchResults({ results, onClose, onOpen }: { results: BatchResult[]; onClose: () => void; onOpen: (id: string) => void }) {
  return (
    <section className="panel min-w-0 p-3 sm:p-4" aria-label="Результат создания ТТН">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Результат · {results.length}</h3>
        <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={onClose}>
          Скрыть
        </Button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {results.map((r) => (
          <li key={r.orderId} className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
            <Badge tone={r.ok ? "ok" : "danger"}>{r.ok ? "создана" : "ошибка"}</Badge>
            <button
              type="button"
              className="hit font-semibold text-[var(--accent-hi)] hover:underline"
              onClick={() => onOpen(r.orderId)}
            >
              #{r.shortId}
            </button>
            {r.ttn && <span className="tabular text-[var(--text)]">{r.ttn}</span>}
            {r.error && <span className="min-w-0 break-words text-[var(--danger-ink)]">{r.error}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
