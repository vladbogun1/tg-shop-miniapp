"use client";

/**
 * KanbanColumn — droppable column for a status (v3: --surface head with a 2px status bar, --bg-2 body).
 * Header: status dot + label + real count (tinted in the status colour); under it the REAL money
 * total of the column (from the server — it used to add up only the loaded cards, at most 300 of
 * them). Closed columns load a short list with "Показать ещё". Highlights when a valid drag hovers;
 * dims when it can't land.
 */
import type { CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import type { OrderCardDto, OrderStatus } from "@/lib/api";
import { money } from "@/lib/money";
import { STATUS_LABEL, STATUS_VAR } from "@/lib/orders";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { DraggableOrderCard } from "./DraggableOrderCard";

interface Props {
  status: OrderStatus;
  orders: OrderCardDto[];
  /** REAL total for this status (may exceed orders.length when capped). */
  count: number;
  /** REAL money total for this status (minor units), from the server. */
  sum?: number;
  onCardClick: (id: string) => void;
  /** true when the active drag could legally drop here */
  validTarget: boolean;
  dragActive: boolean;
  /** Load more cards (closed columns). */
  onMore?: () => void;
  loadingMore?: boolean;
}

export function KanbanColumn({
  status,
  orders,
  count,
  sum,
  onCardClick,
  validTarget,
  dragActive,
  onMore,
  loadingMore,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const total = sum ?? orders.reduce((acc, o) => acc + o.totalMinor, 0);
  const accent = STATUS_VAR[status];

  const dim = dragActive && !validTarget;
  const lit = isOver && validTarget;

  const litStyle: CSSProperties | undefined = lit
    ? {
        borderColor: `color-mix(in srgb, ${accent} 60%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 60%, transparent), 0 0 24px color-mix(in srgb, ${accent} 22%, transparent)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col self-start overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] transition-[opacity,border-color,box-shadow] duration-150",
        dim && "opacity-40",
        validTarget && dragActive && !lit && "border-[var(--line-strong)]"
      )}
      style={litStyle}
    >
      {/* Head on --surface: 2px status bar, dot + title + tinted count, the column's money under it.
          A <header> (not a div) keeps the column itself the innermost div holding title + total
          + body, which is what the e2e locator expects. */}
      <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
        <div aria-hidden className="h-0.5 w-full" style={{ background: accent }} />
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: accent, boxShadow: `0 0 8px color-mix(in srgb, ${accent} 55%, transparent)` }}
            />
            <span className="section-title truncate leading-none">{STATUS_LABEL[status]}</span>
          </div>
          <span
            className="count-badge"
            style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}
          >
            {count}
          </span>
        </div>

        <div className="tabular px-3.5 pb-3 pt-1.5 text-[12px] font-semibold text-[var(--text-muted)]">
          {money(total, "UAH")}
          {orders.length < count && (
            <span className="ml-2 font-normal text-[var(--text-faint)]">
              · показано {orders.length} из {count}
            </span>
          )}
        </div>
      </header>

      <div className="thin-scroll flex max-h-[calc(100dvh-280px)] flex-col gap-2 overflow-y-auto p-2.5">
        {orders.length === 0 ? (
          <div className="font-display flex flex-col items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--line)] px-3 py-8 text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            <Inbox className="h-5 w-5 opacity-60" />
            Пусто
          </div>
        ) : (
          orders.map((o) => <DraggableOrderCard key={o.id} order={o} onClick={() => onCardClick(o.id)} />)
        )}
        {onMore && orders.length < count && (
          <Button size="sm" variant="ghost" loading={loadingMore} onClick={onMore} className="self-center">
            Показать ещё
          </Button>
        )}
      </div>
    </div>
  );
}
