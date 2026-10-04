"use client";

/**
 * MobileBoard — the board on a phone: status tabs + a vertical list of compact cards.
 * Status changes go through a "Переместить в…" bottom sheet (⇄ sits in the card header, next to
 * the time instead of on top of it). Closed tabs show a short list with "Показать ещё".
 * The active tab is owned by the page (the period control is shown only for closed tabs).
 */
import { useState } from "react";
import { ArrowRightLeft, Inbox } from "lucide-react";
import type { OrderStatus } from "@/lib/api";
import type { AdminBoard } from "@/lib/orders-api";
import { money } from "@/lib/money";
import { STATUS_ORDER, STATUS_LABEL, STATUS_VAR, STATUS_ACTION_LABEL, allowedTargets } from "@/lib/orders";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { OrderCard } from "./OrderCard";
import { ActionSheet } from "./ActionSheet";

interface Props {
  board: AdminBoard;
  active: OrderStatus;
  onActiveChange: (s: OrderStatus) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, from: OrderStatus, to: OrderStatus) => void;
  /** Load more cards for a closed tab. */
  onMore?: () => void;
  loadingMore?: boolean;
}

export function MobileBoard({ board, active, onActiveChange, onOpen, onMove, onMore, loadingMore }: Props) {
  const [moveFor, setMoveFor] = useState<{ id: string; from: OrderStatus; label: string } | null>(null);

  const orders = board.columns[active] ?? [];
  const count = board.counts?.[active] ?? orders.length;
  const sum = board.sums?.[active];

  const segOptions = STATUS_ORDER.map((s) => ({
    value: s,
    label: STATUS_LABEL[s],
    count: board.counts?.[s] ?? board.columns[s]?.length ?? 0,
  }));

  return (
    <div>
      {/* Status tabs */}
      <div className="thin-scroll -mx-1 mb-2 overflow-x-auto px-1 pb-1">
        <SegmentedControl options={segOptions} value={active} onChange={onActiveChange} />
      </div>
      {sum != null && count > 0 && (
        <div className="tabular mb-2 px-0.5 text-[12px] font-semibold text-[var(--text-muted)]">
          {count} шт. · {money(sum, "UAH")}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {orders.length === 0 ? (
          <div className="font-display flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-10 text-center text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)]">
            <Inbox className="h-6 w-6 opacity-60" />
            Пусто
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onClick={() => onOpen(o.id)}
              headerAction={
                allowedTargets(o.status).length > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoveFor({ id: o.id, from: o.status, label: o.customerName });
                    }}
                    className="nb-press hit -my-1 grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
                    aria-label="Переместить"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </button>
                ) : undefined
              }
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
                icon: (
                  <span
                    aria-hidden
                    className="mx-1 block h-2 w-2 rounded-full"
                    style={{ background: STATUS_VAR[t] }}
                  />
                ),
                danger: t === "REJECTED",
                onSelect: () => onMove(moveFor.id, moveFor.from, t),
              }))
            : []
        }
      />
    </div>
  );
}
