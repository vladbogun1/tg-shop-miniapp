"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CreditCard, Trash2, Truck } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { prepayMinor, type OptionRow } from "../model/options";

/** Один способ оплаты в форме настроек: название, описание, предоплата, порядок, показ покупателям. */
export function OptionCard({
  o,
  index,
  count,
  onPatch,
  onMove,
  onRemove,
}: {
  o: OptionRow;
  index: number;
  count: number;
  onPatch: (patch: Partial<OptionRow>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "card-2 flex min-w-0 flex-col gap-3 rounded-[var(--r-md)] p-4",
        !o.active && "opacity-70"
      )}
    >
      {/* items-end: the ↑↓ pair and the bin sit level with the field, not with its label. */}
      <div className="flex items-end gap-2">
        <div className="flex shrink-0 flex-col gap-1">
          <OrderBtn label="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </OrderBtn>
          <OrderBtn
            label="Ниже"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </OrderBtn>
        </div>
        <div className="min-w-0 flex-1">
          <Input
            label="Название"
            className="max-w-full"
            value={o.title}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="focusable grid h-[38px] w-10 shrink-0 place-items-center rounded-[var(--r-md)] text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)] pointer-coarse:h-[42px]"
          aria-label="Удалить"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <Input
        label="Описание для покупателя"
        className="max-w-full"
        value={o.description}
        onChange={(e) => onPatch({ description: e.target.value })}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Toggle
          checked={o.requiresPrepayment}
          onChange={(v) => onPatch({ requiresPrepayment: v })}
          label="Предоплата + наложка"
        />
        {o.requiresPrepayment && (
          <Input
            label="Предоплата онлайн, ₴"
            inputMode="decimal"
            className="max-w-full"
            value={o.prepaymentMajor}
            error={o.title.trim() && prepayMinor(o) <= 0 ? "Укажите сумму" : undefined}
            onChange={(e) => onPatch({ prepaymentMajor: e.target.value })}
          />
        )}
      </div>
      <OptionSummary row={o} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <Toggle
          checked={o.active}
          onChange={(v) => onPatch({ active: v })}
          label="Показывать покупателям"
        />
        {!o.active && <Badge tone="warn">выключен</Badge>}
      </div>
    </div>
  );
}

function OrderBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-[17px] w-7 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] disabled:opacity-30 pointer-coarse:h-10 pointer-coarse:w-10"
    >
      {children}
    </button>
  );
}

/** One line under an option: what the customer pays online and what is left for the post office. */
function OptionSummary({ row }: { row: OptionRow }) {
  const pre = prepayMinor(row);
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
      {row.requiresPrepayment ? (
        <>
          <Truck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Онлайн сейчас: <b className="tabular font-semibold text-[var(--text)]">{pre > 0 ? money(pre) : "—"}</b>,
            остаток — наложкой при получении.
          </span>
        </>
      ) : (
        <>
          <CreditCard className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>Вся сумма заказа онлайн через monobank.</span>
        </>
      )}
    </p>
  );
}
