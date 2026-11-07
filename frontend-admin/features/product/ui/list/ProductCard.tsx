"use client";

/** Плитка товара (вид «Карточки»): фото, название, цена, остаток, отметки; витрина и меню «⋯» внизу. */
import { WaitBadge } from "@/features/procurement";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { effStock } from "../../model/stock";
import { Check } from "./Check";
import { CardMarks, PriceTag, StockBadge } from "./RowBits";
import { RowActions } from "./RowActions";
import type { RowProps } from "./ProductRow";

function CardImage({ p, archivedView, selected, onSelect }: Pick<RowProps, "p" | "archivedView" | "selected" | "onSelect">) {
  return (
    <div className="relative border-b border-[var(--line)]">
      <Image src={p.images?.[0]?.url} alt={p.title} size={400} className="aspect-square w-full" />
      {!p.active && !archivedView && (
        <div className="absolute left-2 top-2">
          <Badge tone="warn">скрыт</Badge>
        </div>
      )}
      {!archivedView && (
        <span className="absolute right-2 top-2 grid place-items-center rounded-[var(--r-sm)] bg-[var(--surface)]/90 p-2">
          <Check checked={selected} onChange={onSelect} label={`Выбрать ${p.title}`} />
        </span>
      )}
    </div>
  );
}

export function ProductCard({ p, missing, onComplete, archivedView, selected, onSelect, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <div
      className={cn(
        "card card-hover flex flex-col overflow-hidden p-0 [content-visibility:auto] [contain-intrinsic-size:auto_360px]",
        selected && "!border-[rgba(255,102,0,.45)]",
        danger && !selected && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      )}
    >
      <CardImage p={p} archivedView={archivedView} selected={selected} onSelect={onSelect} />
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--text)]">{p.title}</h3>
        <div className="mt-2">
          <PriceTag p={p} className="text-[15px]" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StockBadge p={p} />
          <WaitBadge productId={p.id} title={p.title} />
          {p.variants && p.variants.length > 0 ? <span className="tabular text-[12px] text-[var(--text-muted)]">{p.variants.length} вар.</span> : null}
          {(p.soldCount ?? 0) > 0 && <span className="tabular text-[12px] text-[var(--text-muted)]">продано {p.soldCount}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <CardMarks p={p} missing={missing} />
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3.5">
          {!archivedView && <Toggle checked={!!p.active} onChange={onActive} label="на витрине" />}
          <span className={archivedView ? "w-full [&_button]:w-full" : ""}>
            <RowActions p={p} archivedView={archivedView} onEdit={onEdit} onComplete={onComplete} onArchive={onArchive} />
          </span>
        </div>
      </div>
    </div>
  );
}
