"use client";

/**
 * KanbanColumn — droppable column for a status (neo `.card-2`).
 * Header shows emoji + label + real count + sum, with a thick colored top accent
 * bar (--st-*). Highlights when a valid drag hovers; dims when the drag can't land.
 * Cards stagger in.
 */
import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { Inbox } from "lucide-react";
import type { OrderCardDto, OrderStatus } from "@/lib/api";
import { money } from "@/lib/money";
import { STATUS_EMOJI, STATUS_LABEL, STATUS_VAR } from "@/lib/orders";
import { staggerContainer, riseItem } from "@/lib/motion";
import { cn } from "@/lib/cn";
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
  const lit = isOver && validTarget;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "card-2 flex w-72 shrink-0 flex-col overflow-hidden shadow-[var(--shadow-1)] transition-all duration-150",
        dim && "opacity-40",
        validTarget && dragActive && !lit && "ring-2 ring-[var(--border-strong)]"
      )}
      style={lit ? { boxShadow: `0 0 0 3px ${accent}, var(--shadow-3)` } : undefined}
    >
      {/* thick colored top accent bar */}
      <div
        className="h-2 w-full shrink-0 border-b-[3px] border-[var(--line)]"
        style={{ background: accent }}
      />

      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px]">{STATUS_EMOJI[status]}</span>
          <span className="text-[13px] font-black uppercase tracking-wide text-[var(--text)]">
            {STATUS_LABEL[status]}
          </span>
        </div>
        <span
          className="rounded-[var(--r-pill)] border-2 border-[var(--line)] px-2 py-0.5 text-[11px] font-black"
          style={{
            background: accent,
            color: "var(--accent-ink)",
          }}
        >
          {count}
        </span>
      </div>

      <div className="px-4 pb-2 pt-1.5 text-[12px] font-bold text-[var(--text-muted)]">
        {money(sum)}
        {orders.length < count && (
          <span className="ml-2 font-medium text-[var(--text-faint)]">
            · показаны первые {orders.length}
          </span>
        )}
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="thin-scroll flex max-h-[calc(100dvh-280px)] flex-col gap-2.5 overflow-y-auto px-3 pb-3 pt-0.5"
      >
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-[var(--r-md)] border-2 border-dashed border-[var(--border-2)] px-3 py-8 text-center text-[12px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            <Inbox className="h-5 w-5 opacity-60" />
            Пусто
          </div>
        ) : (
          orders.map((o) => (
            <motion.div key={o.id} variants={riseItem}>
              <DraggableOrderCard order={o} onClick={() => onCardClick(o.id)} />
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  );
}
