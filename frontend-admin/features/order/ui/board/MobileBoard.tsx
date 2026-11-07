"use client";

/**
 * MobileBoard — one status of the board on a phone: a vertical list of compact cards.
 * Status changes go through a "Переместить в…" bottom sheet (⇄ sits in the card header, next to
 * the time instead of on top of it). Closed tabs show a short list with "Показать ещё".
 * The active tab is owned by the page (the period control is shown only for closed tabs).
 */
import { useState } from "react";
import { Inbox } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import type { AdminBoard } from "../../api";
import { RETURNING, type BoardKey } from "../../model/status";
import { Button } from "@shop/ui/admin-button";
import { OrderCard } from "./OrderCard";
import { CardAction, MoveSheet, type MoveFor } from "./CardActions";

interface Props {
  board: AdminBoard;
  active: BoardKey;
  onOpen: (id: string) => void;
  /** «Посылка вернулась» for a card of «Едет назад». */
  onReceived: (id: string) => void;
  onMove: (id: string, from: OrderStatus, to: OrderStatus) => void;
  /** Load more cards for a closed tab. */
  onMore?: () => void;
  loadingMore?: boolean;
}

function EmptyColumn() {
  return (
    <div className="font-display flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-10 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
      <Inbox className="h-6 w-6 opacity-60" />
      Пусто
    </div>
  );
}

/** The count and the sum of a status are in the screen's StatusHeader; only the units on the way back are extra. */
function Summary({ orders, returning }: { orders: AdminBoard["columns"][OrderStatus]; returning: boolean }) {
  if (!returning || orders.length === 0) return null;
  return <div className="tabular mb-2 px-0.5 text-[12px] font-semibold text-[var(--text-muted)]">{orders.reduce((acc, o) => acc + (o.returningUnits ?? 0), 0)} шт. в пути на склад</div>;
}

export function MobileBoard({ board, active, onOpen, onReceived, onMove, onMore, loadingMore }: Props) {
  const [moveFor, setMoveFor] = useState<MoveFor | null>(null);

  const orders = board.columns[active] ?? [];
  const count = board.counts?.[active] ?? orders.length;
  const returning = active === RETURNING;

  return (
    <div>
      {/* The status name, count and sum are in the screen's sticky panel (StatusHeader). */}
      <Summary orders={orders} returning={returning} />

      <div className="flex flex-col gap-2">
        {orders.length === 0 ? (
          <EmptyColumn />
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              returning={returning}
              onClick={() => onOpen(o.id)}
              headerAction={<CardAction order={o} returning={returning} onReceived={onReceived} onMoveFor={setMoveFor} />}
            />
          ))
        )}
        {onMore && orders.length < count && (
          <Button variant="ghost" loading={loadingMore} onClick={onMore} className="self-center">
            Показать ещё ({orders.length} из {count})
          </Button>
        )}
      </div>

      <MoveSheet moveFor={moveFor} onClose={() => setMoveFor(null)} onMove={onMove} />
    </div>
  );
}
