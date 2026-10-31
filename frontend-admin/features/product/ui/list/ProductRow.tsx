"use client";

import { motion } from "framer-motion";
import { Archive, ArchiveRestore, Pencil, Wand2 } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { WaitBadge } from "@/components/preorders/WaitBadge";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";
import { cn } from "@/lib/cn";
import { riseItem } from "@/lib/motion";
import { effStock, isUnfinished } from "../../model/stock";
import type { AdminProduct as Product } from "../../model/types";
import { CardMarks, IconBtn, PriceTag, RowMenu, StockBadge } from "./RowBits";

export interface RowProps {
  p: Product;
  /** Required characteristics without a value. */
  missing: number;
  onComplete: () => void;
  archivedView: boolean;
  onEdit: () => void;
  onActive: (v: boolean) => void;
  onArchive: (a: boolean) => void;
}

function RowMeta({ p, missing }: { p: Product; missing: number }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
      <PriceTag p={p} />
      <StockBadge p={p} />
      <WaitBadge productId={p.id} title={p.title} />
      {p.variants && p.variants.length > 0 && (
        <span className="tabular">{p.variants.length} вар.</span>
      )}
      {(p.soldCount ?? 0) > 0 && (
        <span className="tabular">продано {p.soldCount}</span>
      )}
      {p.brandRef?.name && <span className="truncate">{p.brandRef.name}</span>}
      <CardMarks p={p} missing={missing} />
    </div>
  );
}

type ControlsProps = Pick<
  RowProps,
  "archivedView" | "onEdit" | "onComplete" | "onActive" | "onArchive"
> & { p: Product };

/** Controls must not also trigger the row's «open editor» click. */
function RowControls({
  p,
  archivedView,
  onEdit,
  onComplete,
  onActive,
  onArchive,
}: ControlsProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {!archivedView ? (
        <>
          <div
            className="flex flex-col items-center gap-0.5"
            title="Показывать на сайте и в Mini App"
          >
            <Toggle checked={!!p.active} onChange={onActive} />
            <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
              на витрине
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {isUnfinished(p) && (
              <Button
                size="sm"
                variant={isUnfinished(p) ? "outline" : "ghost"}
                icon={<Wand2 className="h-3.5 w-3.5" />}
                onClick={onComplete}
              >
                Оформить с ИИ
              </Button>
            )}
            <IconBtn label="Редактировать" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconBtn>
            <IconBtn label="В архив" onClick={() => onArchive(true)} danger>
              <Archive className="h-4 w-4" />
            </IconBtn>
          </div>
          <div className="sm:hidden">
            <RowMenu
              onEdit={onEdit}
              onArchive={() => onArchive(true)}
              onComplete={
                (p.cardStatus ?? "DRAFT") === "DRAFT" ? onComplete : undefined
              }
            />
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="surface"
          icon={<ArchiveRestore className="h-4 w-4" />}
          onClick={() => onArchive(false)}
        >
          Восстановить
        </Button>
      )}
    </div>
  );
}

export function ProductRow({
  p,
  missing,
  onComplete,
  archivedView,
  onEdit,
  onActive,
  onArchive,
}: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <motion.div
      variants={riseItem}
      role={archivedView ? undefined : "button"}
      tabIndex={archivedView ? undefined : 0}
      onClick={archivedView ? undefined : onEdit}
      onKeyDown={(e) => {
        if (
          !archivedView &&
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "card flex items-center gap-3 p-3 sm:gap-3.5",
        !archivedView && "card-hover cursor-pointer",
        danger && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]",
      )}
    >
      <Image
        src={p.images?.[0]?.url}
        alt={p.title}
        size={120}
        className="h-14 w-14 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 break-words text-[14px] font-semibold leading-snug text-[var(--text)] sm:line-clamp-1">
            {p.title}
          </h3>
          {!p.active && !archivedView && <Badge tone="warn">скрыт</Badge>}
        </div>
        <RowMeta p={p} missing={missing} />
      </div>
      <RowControls
        p={p}
        archivedView={archivedView}
        onEdit={onEdit}
        onComplete={onComplete}
        onActive={onActive}
        onArchive={onArchive}
      />
    </motion.div>
  );
}
