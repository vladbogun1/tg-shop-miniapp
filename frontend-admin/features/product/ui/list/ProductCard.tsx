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
import { CardMarks, IconBtn, PriceTag, StockBadge } from "./RowBits";
import type { RowProps } from "./ProductRow";

export function ProductCard({ p, missing, onComplete, archivedView, onEdit, onActive, onArchive }: RowProps) {
  const danger = p.active !== false && effStock(p) === 0 && !archivedView;
  return (
    <motion.div
      variants={riseItem}
      className={cn(
        "card card-hover flex flex-col overflow-hidden p-0",
        danger && "border-[color-mix(in_srgb,var(--danger)_45%,transparent)]"
      )}
    >
      <div className="relative border-b border-[var(--line)]">
        <Image src={p.images?.[0]?.url} alt={p.title} size={400} className="aspect-square w-full" />
        {!p.active && !archivedView && (
          <div className="absolute left-2 top-2">
            <Badge tone="warn">скрыт</Badge>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--text)]">
          {p.title}
        </h3>
        <div className="mt-2">
          <PriceTag p={p} className="text-[15px]" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StockBadge p={p} />
          <WaitBadge productId={p.id} title={p.title} />
          {p.variants && p.variants.length > 0 ? (
            <span className="tabular text-[12px] text-[var(--text-muted)]">
              {p.variants.length} вар.
            </span>
          ) : null}
          {(p.soldCount ?? 0) > 0 && (
            <span className="tabular text-[12px] text-[var(--text-muted)]">
              продано {p.soldCount}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <CardMarks p={p} missing={missing} />
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3.5">
          {!archivedView ? (
            <>
              <Toggle checked={!!p.active} onChange={onActive} label="на витрине" />
              <div className="flex gap-2">
                {isUnfinished(p) && (
                  <IconBtn label="Оформить с ИИ" onClick={onComplete}>
                    <Wand2 className="h-4 w-4" />
                  </IconBtn>
                )}
                <IconBtn label="Редактировать" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                </IconBtn>
                <IconBtn label="В архив" onClick={() => onArchive(true)} danger>
                  <Archive className="h-4 w-4" />
                </IconBtn>
              </div>
            </>
          ) : (
            <Button
              size="sm"
              variant="surface"
              className="w-full"
              icon={<ArchiveRestore className="h-4 w-4" />}
              onClick={() => onArchive(false)}
            >
              Восстановить
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

