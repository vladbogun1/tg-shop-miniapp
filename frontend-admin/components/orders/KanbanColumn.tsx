"use client";

/**
 * KanbanColumn — droppable glass column for a status.
 * Header shows count + sum. Highlights when a valid drag hovers.
 */
import { useDroppable } from "@dnd-kit/core";
import type { OrderCardDto, OrderStatus } from "@/lib/api";
import { money } from "@/lib/money";
import { STATUS_EMOJI, STATUS_LABEL, STATUS_VAR } from "@/lib/orders";
import { DraggableOrderCard } from "./DraggableOrderCard";

interface Props {
  status: OrderStatus;
  orders: OrderCardDto[];
  /** REAL total for this status (may exceed orders.length when capped). */
  count: number;
  onCardClick: (id: string) => void;
  /** true when the active drag could legally drop here */
  validTarget: boolean;
  dragActive: boolean;
}

export function KanbanColumn({
  status,
  orders,
  count,
  onCardClick,
  validTarget,
  dragActive,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const sum = orders.reduce((acc, o) => acc + o.totalMinor, 0);
  const accent = STATUS_VAR[status];

  const dim = dragActive && !validTarget;

  return (
    <div
      ref={setNodeRef}
      className={`glass flex w-72 shrink-0 flex-col rounded-[var(--r-lg)] transition-all ${
        isOver && validTarget ? "ring-2 ring-[var(--accent)]" : ""
      } ${dim ? "opacity-40" : ""}`}
      style={
        validTarget && isOver
          ? { boxShadow: `0 0 0 2px ${accent}, var(--shadow-2)` }
          : undefined
      }
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3"
        style={{ borderColor: `color-mix(in srgb, ${accent} 30%, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <span>{STATUS_EMOJI[status]}</span>
          <span className="text-[14px] font-semibold text-[var(--text)]">
            {STATUS_LABEL[status]}
          </span>
          <span
            className="rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-bold"
            style={{
              background: `color-mix(in srgb, ${accent} 22%, transparent)`,
              color: accent,
            }}
          >
            {count}
          </span>
        </div>
      </div>
      <div className="px-4 py-1.5 text-[12px] text-[var(--text-muted)]">
        {money(sum)}
      </div>
      {orders.length < count && (
        <div className="px-4 pb-1 text-[11px] text-[var(--text-faint)]">
          показаны первые {orders.length}
        </div>
      )}

      <div className="thin-scroll flex max-h-[calc(100dvh-260px)] flex-col gap-2.5 overflow-y-auto p-3 pt-1.5">
        {orders.length === 0 && (
          <div className="rounded-[var(--r-md)] border border-dashed border-white/10 px-3 py-6 text-center text-[12px] text-[var(--text-faint)]">
            Пусто
          </div>
        )}
        {orders.map((o) => (
          <DraggableOrderCard key={o.id} order={o} onClick={() => onCardClick(o.id)} />
        ))}
      </div>
    </div>
  );
}
