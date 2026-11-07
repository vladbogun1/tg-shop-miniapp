"use client";

import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { prepayMinor, type OptionRow } from "../model/options";

function OrderBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focusable grid h-[22px] w-7 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-3)] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] disabled:opacity-30 pointer-coarse:h-[22px] pointer-coarse:w-11"
    >
      {children}
    </button>
  );
}

/**
 * Свёрнутая строка способа оплаты: порядок ↑↓, название и описание (раскрывают правку), бейджи «Предоплата N» / «выключен»,
 * переключатель «Показывать покупателям». Правка — под строкой (ноутбук) или в шторке (телефон), см. OptionsList.
 */
export function OptionRowView({
  o,
  index,
  count,
  open,
  invalid,
  onOpen,
  onPatch,
  onMove,
  children,
}: {
  o: OptionRow;
  index: number;
  count: number;
  open: boolean;
  invalid: boolean;
  onOpen: () => void;
  onPatch: (patch: Partial<OptionRow>) => void;
  onMove: (delta: -1 | 1) => void;
  /** Раскрытая правка (только ноутбук). */
  children?: ReactNode;
}) {
  const pre = prepayMinor(o);
  return (
    <li
      className={cn(
        "card-2 min-w-0 rounded-[var(--r-md)] border border-transparent",
        !o.active && "opacity-75",
        open && "border-[var(--line-strong)]",
        invalid && "!border-[var(--danger)]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
        <div className="flex shrink-0 flex-col gap-1">
          <OrderBtn label="Выше" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </OrderBtn>
          <OrderBtn label="Ниже" disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </OrderBtn>
        </div>
        <button
          type="button"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={`Изменить способ: ${o.title.trim() || "без названия"}`}
          className="focusable flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[var(--r-sm)] text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-[var(--text)]">{o.title.trim() || "Новый способ"}</span>
            <span className="block truncate text-[12px] text-[var(--text-muted)]">
              {o.description.trim() || (o.requiresPrepayment ? "Предоплата онлайн, остаток наложкой" : "Полная оплата онлайн")}
            </span>
          </span>
          {o.requiresPrepayment && <Badge tone="warn" className="hidden shrink-0 sm:inline-flex">Предоплата {pre > 0 ? money(pre) : "—"}</Badge>}
          {!o.active && <Badge tone="neutral" className="shrink-0">выключен</Badge>}
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", open && "rotate-180")} />
        </button>
        <div className="shrink-0 [&_label>span]:sr-only">
          <Toggle checked={o.active} onChange={(v) => onPatch({ active: v })} label="Показывать покупателям" />
        </div>
      </div>
      {children && <div className="border-t border-[var(--line)] px-3 py-3">{children}</div>}
    </li>
  );
}
