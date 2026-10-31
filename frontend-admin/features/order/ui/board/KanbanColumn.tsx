"use client";

/**
 * KanbanColumn — droppable column for a status (v3: --surface head with a 2px status bar, --bg-2 body).
 * Header: status dot + label + real count (tinted in the status colour); under it the REAL money
 * total of the column (from the server — it used to add up only the loaded cards, at most 300 of
 * them). Closed columns load a short list with "Показать ещё". Highlights when a valid drag hovers;
 * dims when it can't land.
 * Width: the columns share the board (232–340px each) so six of them fit a 1920 screen without a
 * sideways scroll; an empty «Едет назад» folds into a 44px rail and opens while a card that may
 * land there is dragged.
 */
import type { CSSProperties } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Inbox } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import type { AdminOrderCard } from "../../api";
import { columnTotal, returningTotals } from "../../model/board";
import { BOARD_LABEL, BOARD_VAR, RETURNING, type BoardKey } from "../../model/status";
import { DraggableOrderCard } from "./DraggableOrderCard";
import { OrderCard } from "./OrderCard";

interface Props {
  status: BoardKey;
  orders: AdminOrderCard[];
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

const tint = (accent: string, pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`;

function Rail({ status, accent, dim, setNodeRef }: { status: BoardKey; accent: string; dim: boolean; setNodeRef: (el: HTMLElement | null) => void }) {
  return (
    <div
      ref={setNodeRef}
      title={`${BOARD_LABEL[status]}: пусто`}
      className={cn(
        "flex w-11 shrink-0 flex-col items-center gap-3 overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] pb-4 transition-opacity duration-150",
        dim && "opacity-40"
      )}
    >
      <div aria-hidden className="h-0.5 w-full" style={{ background: accent }} />
      <span className="count-badge" style={{ background: tint(accent, 18), color: accent }}>
        0
      </span>
      <span className="section-title whitespace-nowrap leading-none [writing-mode:vertical-rl]">{BOARD_LABEL[status]}</span>
    </div>
  );
}

function Head({ status, orders, count, sum, accent }: { status: BoardKey; orders: AdminOrderCard[]; count: number; sum?: number; accent: string }) {
  const back = returningTotals(orders);
  const summary =
    status === RETURNING
      ? `${back.units} шт. в пути на склад${back.minor > 0 ? ` · ${money(back.minor, "UAH")}` : ""}`
      : money(columnTotal(orders, sum), "UAH");
  return (
    // A <header> (not a div) keeps the column itself the innermost div holding title + total
    // + body, which is what the e2e locator expects.
    <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)]">
      <div aria-hidden className="h-0.5 w-full" style={{ background: accent }} />
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 8px ${tint(accent, 55)}` }} />
          <span className="section-title truncate leading-none">{BOARD_LABEL[status]}</span>
        </div>
        <span className="count-badge" style={{ background: tint(accent, 18), color: accent }}>
          {count}
        </span>
      </div>

      <div className="tabular px-3.5 pb-3 pt-1.5 text-[12px] font-semibold text-[var(--text-muted)]">
        {summary}
        {orders.length < count && (
          <span className="ml-2 font-normal text-[var(--text-faint)]">
            · показано {orders.length} из {count}
          </span>
        )}
      </div>
    </header>
  );
}

export function KanbanColumn({ status, orders, count, sum, onCardClick, validTarget, dragActive, onMore, loadingMore }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const returning = status === RETURNING;
  const accent = BOARD_VAR[status];

  const dim = dragActive && !validTarget;
  const lit = isOver && validTarget;
  const rail = returning && count === 0 && !(dragActive && validTarget);

  const litStyle: CSSProperties | undefined = lit
    ? { borderColor: tint(accent, 60), boxShadow: `0 0 0 1px ${tint(accent, 60)}, 0 0 24px ${tint(accent, 22)}` }
    : undefined;

  if (rail) return <Rail status={status} accent={accent} dim={dim} setNodeRef={setNodeRef} />;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-0 min-w-[232px] max-w-[340px] flex-1 basis-0 flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] transition-[opacity,border-color,box-shadow] duration-150",
        dim && "opacity-40",
        validTarget && dragActive && !lit && "border-[var(--line-strong)]"
      )}
      style={litStyle}
    >
      <Head status={status} orders={orders} count={count} sum={sum} accent={accent} />

      {/* Fills the column; scrolling stops at its ends instead of carrying the page along. */}
      <div className="thin-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2.5">
        {orders.length === 0 ? (
          <div className="font-display flex flex-col items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--line)] px-3 py-8 text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            <Inbox className="h-5 w-5 opacity-60" />
            Пусто
          </div>
        ) : (
          orders.map((o) =>
            returning ? (
              <OrderCard key={o.id} order={o} returning onClick={() => onCardClick(o.id)} />
            ) : (
              <DraggableOrderCard key={o.id} order={o} onClick={() => onCardClick(o.id)} />
            )
          )
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
