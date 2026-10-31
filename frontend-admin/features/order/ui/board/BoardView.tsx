"use client";

/**
 * The board half of the orders screen.
 *  - Desktop (lg+): kanban with dnd-kit drag-between-columns -> PATCH status.
 *    SHIPPED prompts ТТН, REJECTED a reason, DELIVERED a confirmation. Transitions validated.
 *    Optimistic update + rollback on error.
 *  - Phone: status tabs + list with a "Переместить в…" sheet (MobileBoard).
 *    Only ONE of the two is mounted (matchMedia) — both used to render, hidden by CSS.
 *  - The period applies to the closed columns (Доставлен / Отклонён) only: an active order is never
 *    hidden by it. Closed columns load 20 cards + "Показать ещё".
 *  - «Едет назад» (V68) is a column, not a status: parcels on their way back. A SHIPPED card dropped
 *    on it = reject with «Посылка едет назад»; a DELIVERED one opens the return wizard.
 */
import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { QueryState } from "@/components/ui/QueryState";
import { TodayStrip } from "@/features/analytics";
import { WantedWidget } from "@/features/procurement";
import { useIsDesktop } from "@/lib/use-media";
import type { AdminBoard } from "../../api";
import { CLOSED_MAX, CLOSED_PAGE, isClosedColumn, onlyPaidNew } from "../../model/board";
import type { OrdersPeriod } from "../../model/period";
import type { BoardKey } from "../../model/status";
import { boardKey, type BoardQuery } from "../../queries/board";
import { StatusMoveModal } from "./StatusMoveModal";
import { DesktopBoard } from "./DesktopBoard";
import { MobileBoard } from "./MobileBoard";
import { useBoardMoves, type OpenAction } from "./use-board-moves";

interface Props {
  /** Already debounced. */
  search: string;
  /** The board query lives in the screen: it keeps polling while the table is shown. */
  boardQ: BoardQuery;
  closedLimit: number;
  onClosedLimit: (n: number) => void;
  period: OrdersPeriod;
  mobileTab: BoardKey;
  onMobileTab: (s: BoardKey) => void;
  /** «Сегодня» link: only paid NEW orders, waiting to be approved. */
  paidNewOnly: boolean;
  onClearPaidNew: () => void;
  onOpen: (id: string, action?: OpenAction) => void;
}

function PaidNewNotice({ onClear }: { onClear: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[13px] font-semibold text-[var(--text)]">Показаны только оплаченные новые заказы — подтвердите их</span>
      <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={onClear}>
        Сбросить
      </Button>
    </div>
  );
}

export function BoardView({ search, boardQ, closedLimit, onClosedLimit, period, mobileTab, onMobileTab, paidNewOnly, onClearPaidNew, onOpen }: Props) {
  const isDesktop = useIsDesktop();

  const queryKey = boardKey(search, period, closedLimit);

  const rawBoard = boardQ.data;
  // "Оплачены, ждут подтверждения": paid online, still NEW — the admin has to approve them.
  const board = useMemo<AdminBoard | undefined>(() => (rawBoard && paidNewOnly ? onlyPaidNew(rawBoard) : rawBoard), [rawBoard, paidNewOnly]);

  const moves = useBoardMoves({ board, queryKey, onOpen });

  // The backend caps a closed column at CLOSED_MAX cards; past it «Показать ещё» would do nothing.
  const showMore = closedLimit < CLOSED_MAX ? () => onClosedLimit(Math.min(CLOSED_MAX, closedLimit + CLOSED_PAGE)) : undefined;
  const loadingMore = boardQ.isFetching && !boardQ.isLoading;

  return (
    <>
      <TodayStrip />
      <WantedWidget />
      {paidNewOnly && <PaidNewNotice onClear={onClearPaidNew} />}
      <QueryState
        isLoading={boardQ.isLoading || (!board && !boardQ.isError)}
        isError={boardQ.isError && !board}
        error={boardQ.error}
        refetch={boardQ.refetch}
        loadingLabel="Загружаем доску…"
      >
        {board &&
          (isDesktop ? (
            <DesktopBoard
              board={board}
              activeId={moves.activeId}
              activeOrder={moves.activeOrder}
              loadingMore={loadingMore}
              onMore={showMore}
              onOpen={(id) => onOpen(id)}
              onDragStart={moves.onDragStart}
              onDragEnd={moves.onDragEnd}
              onDragCancel={moves.onDragCancel}
            />
          ) : (
            <MobileBoard
              board={board}
              active={mobileTab}
              onActiveChange={onMobileTab}
              onOpen={(id) => onOpen(id)}
              onReceived={(id) => onOpen(id, "received")}
              onMove={moves.requestMove}
              onMore={isClosedColumn(mobileTab) ? showMore : undefined}
              loadingMore={loadingMore}
            />
          ))}
      </QueryState>
      <StatusMoveModal moves={moves} />
    </>
  );
}
