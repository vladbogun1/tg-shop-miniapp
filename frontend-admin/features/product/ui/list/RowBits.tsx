"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { CardStatusBadge, ConditionBadge } from "@/features/catalog";
import { useShopSetting } from "@/features/settings";
import { Badge } from "@/components/ui/Badge";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { effStock, isUnfinished } from "../../model/stock";
import type { AdminProduct as Product } from "../../model/types";

export function StockBadge({ p }: { p: Product }) {
  const stock = effStock(p);
  const lowQty = useShopSetting("catalog.lowStockQty", 3);
  if (p.active !== false && stock === 0) return <Badge tone="danger">Закончился</Badge>;
  if (stock <= lowQty && stock > 0) return <Badge tone="warn">Мало: {stock}</Badge>;
  return (
    <span className="tabular text-[12px] text-[var(--text-muted)]">
      Остаток: {stock}
    </span>
  );
}

/** Price: Exo 2 700 tabular in white, like the shop's price (no filled tag in v3). */
export function PriceTag({ p, className }: { p: Product; className?: string }) {
  return (
    <span className={cn("font-display tabular inline-flex items-center text-[14px] font-bold text-[var(--ink)]", className)}>
      {money(p.priceMinor, p.currency)}
    </span>
  );
}

export function IconBtn({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "nb-press focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors pointer-coarse:h-11 pointer-coarse:w-11",
        danger
          ? "hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]"
          : "hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}

/** Phone-only «⋯» menu for the row actions (edit / archive). */
export function RowMenu({ onEdit, onArchive, onComplete }: { onEdit: () => void; onArchive: () => void; onComplete?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item =
    "block w-full rounded-[var(--r-sm)] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors hover:bg-[var(--surface-hover)]";
  return (
    <div ref={ref} className="relative">
      <IconBtn label="Действия" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-4 w-4" />
      </IconBtn>
      {open && (
        <div className="elevated absolute right-0 top-11 z-20 w-44 overflow-hidden p-1 pointer-coarse:top-12">
          {onComplete && (
            <button type="button" className={cn(item, "text-[var(--accent-hi)]")} onClick={() => (setOpen(false), onComplete())}>
              Оформить с ИИ
            </button>
          )}
          <button type="button" className={item} onClick={() => (setOpen(false), onEdit())}>
            Редактировать
          </button>
          <button
            type="button"
            className={cn(item, "text-[var(--danger-ink)]")}
            onClick={() => (setOpen(false), onArchive())}
          >
            В архив
          </button>
        </div>
      )}
    </div>
  );
}

/** «Незавершён» for unfinished products, otherwise the card status (+ «неполная»), and the condition. */
export function CardMarks({ p, missing }: { p: Product; missing: number }) {
  if (isUnfinished(p)) {
    return (
      <span className="chip-tint" style={{ ["--chip" as string]: "var(--warn)" }} title="Создан коротко и ещё не оформлен — скрыт с витрины">
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
        Незавершён
      </span>
    );
  }
  return (
    <>
      <CardStatusBadge status={p.cardStatus} confidence={p.cardConfidence} incomplete={missing} compact />
      <ConditionBadge condition={p.condition} />
    </>
  );
}


export function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card flex flex-col gap-2 p-3.5">
      <span className="field-label !text-[11px]">{label}</span>
      <span className={cn("kpi-num truncate text-[20px]", accent && "!text-[var(--accent-hi)]")}>
        {value}
      </span>
    </div>
  );
}
