"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CardStatusChip, ConfidencePill, Thumb } from "../shared";
import type { CardItem } from "../../model/item";

/** Шапка панели: фото, название, статус карточки, уверенность ИИ, видимость на витрине. */
export function PanelHeader({ cur, onClose }: { cur: CardItem; onClose: () => void }) {
  return (
    <div
      data-app-chrome
      className="flex items-start gap-3 border-b border-[var(--line)] px-4 pb-3 pt-[calc(12px+var(--safe-top))] sm:px-5 sm:pt-[calc(16px+var(--safe-top))]"
    >
      <Thumb src={cur.imageUrl} alt={cur.title} size={52} />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--ink)]" title={cur.title}>
          {cur.title}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <CardStatusChip status={cur.cardStatus} />
          {cur.cardConfidence != null && <ConfidencePill value={cur.cardConfidence} label="ИИ" />}
          {cur.unfinished === true ? (
            <Badge tone="warn">новый, скрыт</Badge>
          ) : cur.active !== true ? (
            <Badge tone="neutral">скрыт</Badge>
          ) : (
            <Badge tone="ok">на витрине</Badge>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Закрыть (Esc)"
        title="Закрыть (Esc)"
        className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
