"use client";

/**
 * MobileBoard — the board on a phone: status tabs + a vertical list of compact cards.
 * Status changes go through a "Переместить в…" bottom sheet (⇄ sits in the card header, next to
 * the time instead of on top of it). Closed tabs show a short list with "Показать ещё".
 * The active tab is owned by the page (the period control is shown only for closed tabs).
 */
import { useState } from "react";
import { ArrowRightLeft, Inbox, PackageCheck } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import type { AdminBoard } from "../../api";
import { money } from "@/lib/money";
import { BOARD_LABEL, BOARD_ORDER, RETURNING, STATUS_VAR, STATUS_ACTION_LABEL, allowedTargets, returningMinor, type BoardKey } from "../../model/status";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@shop/ui/admin-button";
import { OrderCard } from "./OrderCard";
import { ActionSheet } from "@/components/ui/ActionSheet";

interface Props {
  board: AdminBoard;
  active: BoardKey;
  onActiveChange: (s: BoardKey) => void;
  onOpen: (id: string) => void;
  /** «Посылка вернулась» for a card of «Едет назад». */
  onReceived: (id: string) => void;
  onMove: (id: string, from: OrderStatus, to: OrderStatus) => void;
  /** Load more cards for a closed tab. */
  onMore?: () => void;
  loadingMore?: boolean;
}

const ACTION_BTN =
  "nb-press hit -my-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]";

function EmptyColumn() {
  return (
    <div className="font-display flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-10 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
      <Inbox className="h-6 w-6 opacity-60" />
      Пусто
    </div>
  );
}

function Summary({ orders, returning, count, sum }: { orders: AdminBoard["columns"][OrderStatus]; returning: boolean; count: number; sum?: number }) {
  const cls = "tabular mb-2 px-0.5 text-[12px] font-semibold text-[var(--text-muted)]";
  if (returning) {
    if (orders.length === 0) return null;
    return (
      <div className={cls}>
        {orders.reduce((acc, o) => acc + (o.returningUnits ?? 0), 0)} шт. в пути на склад ·{" "}
        {money(orders.reduce((acc, o) => acc + returningMinor(o), 0), "UAH")}
      </div>
    );
  }
  if (sum == null || count === 0) return null;
  return (
    <div className={cls}>
      {count} шт. · {money(sum, "UAH")}
    </div>
  );
}

interface CardActionProps {
  order: AdminBoard["columns"][OrderStatus][number];
  returning: boolean;
  onReceived: (id: string) => void;
  onMoveFor: (m: { id: string; from: OrderStatus; label: string }) => void;
}

/** Кнопка в шапке карточки: «Посылка вернулась» в «Едет назад», иначе «Переместить». */
function CardAction({ order, returning, onReceived, onMoveFor }: CardActionProps) {
  if (returning) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onReceived(order.id);
        }}
        className={ACTION_BTN}
        aria-label="Посылка вернулась"
        title="Посылка вернулась"
      >
        <PackageCheck className="h-4 w-4" />
      </button>
    );
  }
  if (allowedTargets(order.status).length === 0) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onMoveFor({ id: order.id, from: order.status, label: order.customerName });
      }}
      className={ACTION_BTN}
      aria-label="Переместить"
    >
      <ArrowRightLeft className="h-4 w-4" />
    </button>
  );
}

export function MobileBoard({ board, active, onActiveChange, onOpen, onReceived, onMove, onMore, loadingMore }: Props) {
  const [moveFor, setMoveFor] = useState<{ id: string; from: OrderStatus; label: string } | null>(null);

  const orders = board.columns[active] ?? [];
  const count = board.counts?.[active] ?? orders.length;
  const returning = active === RETURNING;
  const sum = returning ? undefined : board.sums?.[active];

  const segOptions = BOARD_ORDER.map((s) => ({
    value: s,
    label: BOARD_LABEL[s],
    count: board.counts?.[s] ?? board.columns[s]?.length ?? 0,
  }));

  return (
    <div>
      {/* Status tabs */}
      <div className="thin-scroll -mx-1 mb-2 overflow-x-auto px-1 pb-1">
        <SegmentedControl options={segOptions} value={active} onChange={onActiveChange} />
      </div>
      <Summary orders={orders} returning={returning} count={count} sum={sum} />

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

      <ActionSheet
        open={!!moveFor}
        title={moveFor ? `Переместить · ${moveFor.label}` : undefined}
        onClose={() => setMoveFor(null)}
        actions={
          moveFor
            ? allowedTargets(moveFor.from).map((t) => ({
                key: t,
                label: STATUS_ACTION_LABEL[t],
                icon: <span aria-hidden className="mx-1 block h-2 w-2 rounded-full" style={{ background: STATUS_VAR[t] }} />,
                danger: t === "REJECTED",
                onSelect: () => onMove(moveFor.id, moveFor.from, t),
              }))
            : []
        }
      />
    </div>
  );
}
