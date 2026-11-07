"use client";

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
