"use client";

/**
 * Orders (route "/"): the board and the table over one search / period, the order drawer and
 * the «Новый заказ» window. Board mechanics (drag, statuses, closed columns) live in ui/board.
 *
 * Layout by size (the title is already in the shell's top bar — no page header here):
 *  - tablet and up: one toolbar line, one line of «Сегодня» chips, then the board filling the rest
 *    of the screen as a single scroll container (see DesktopBoard);
 *  - phone: a list of statuses (like a chat list) with a short summary of each; a tap opens the status.
 *    A sticky panel under the top bar holds the search (it folds away while scrolling down and comes
 *    back on the first scroll up) and, inside a status, «‹ name  count · sum»; the period (closed
 *    statuses, table) sits under the panel; board/table and refresh are behind «⋯».
 */
import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { useHideOnScroll } from "@/lib/use-hide-on-scroll";
import type { AdminBoard } from "../api";
import { orderKeys } from "../keys";
import { CLOSED_PAGE, isClosedColumn, onlyPaidNew, parseBoardLink } from "../model/board";
import type { OrdersView } from "../model/view";
import { useBoardQuery, useRefreshOrders } from "../queries/board";
import { BoardView } from "./board/BoardView";
import { StatusHeader } from "./board/StatusHeader";
import type { OpenAction } from "./board/use-board-moves";
import { OrderDrawer } from "./drawer/OrderDrawer";
import { NewOrderModal } from "./new-order/NewOrderModal";
import { MoreButton, NewOrderButton, OrdersToolbar, RefreshButton } from "./OrdersToolbar";
import { OrdersMoreSheet } from "./OrdersMoreSheet";
import { OrdersStickyPanel } from "./OrdersStickyPanel";
import { OrdersPeriodPicker } from "./OrdersPeriodPicker";
import { OrdersTable } from "./table/OrdersTable";
import { useIsKanban } from "./use-is-kanban";
import { useOrdersPeriod } from "./use-orders-period";
import { useStatusNav } from "./use-status-nav";

/** What the status header counts: the same filtered board the cards come from. */
function shownBoard(board: AdminBoard | undefined, paidNewOnly: boolean): AdminBoard | undefined {
  return board && paidNewOnly ? onlyPaidNew(board) : board;
}

export function OrdersScreen() {
  const phone = !useIsKanban();
  const refresh = useRefreshOrders();
  const fetching = useIsFetching({ queryKey: orderKeys.board() }) > 0;
  const [view, setView] = useState<OrdersView>("board");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useOrdersPeriod();
  const { tab: mobileTab, open: openStatus, back: backToList, show: showStatus } = useStatusNav();
  const [openId, setOpenId] = useState<string | null>(null);
  /** What the drawer opens with: the return wizard / «Посылка вернулась» (from «Едет назад»). */
  const [openAction, setOpenAction] = useState<OpenAction | undefined>(undefined);
  const [newOpen, setNewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // A typed search stays in sight: folding it away would hide why the list is short.
  const { hidden: searchHidden, reveal } = useHideOnScroll(phone && search === "");

  // «Сегодня» links land here as /?status=NEW or /?payment=paid. Read once from the URL (no
  // useSearchParams: it would force a Suspense boundary around the whole board).
  const [paidNewOnly, setPaidNewOnly] = useState(false);
  useEffect(() => {
    const link = parseBoardLink(window.location.search);
    if (link.tab) showStatus(link.tab);
    if (link.paidNewOnly) setPaidNewOnly(true);
  }, [showStatus]);
  function clearPaidNew() {
    setPaidNewOnly(false);
    window.history.replaceState(null, "", window.location.pathname);
  }

  // Debounced so typing does not fire a board load per keystroke.
  const debouncedSearch = useDebounced(search);
  // The board query stays mounted under the table too — it polls and keeps «Обновить» spinning, as before.
  const [closedLimit, setClosedLimit] = useState(CLOSED_PAGE);
  const boardQ = useBoardQuery(debouncedSearch, period, closedLimit);

  function openOrder(id: string, action?: OpenAction) {
    setOpenAction(action);
    setOpenId(id);
  }

  // The period matters only for the closed columns / the table.
  const showRange = view === "table" || !phone || (mobileTab !== null && isClosedColumn(mobileTab));
  const statusOpen = phone && view === "board" && mobileTab !== null;

  const newOrderButton = <NewOrderButton onClick={() => setNewOpen(true)} />;
  const actions = phone ? (
    <>
      {newOrderButton}
      <MoreButton spinning={fetching} onClick={() => setMoreOpen(true)} />
    </>
  ) : (
    <>
      <RefreshButton spinning={fetching} onClick={refresh} />
      {newOrderButton}
    </>
  );

  return (
    <div>
      <h1 className="sr-only">Заказы</h1>
      <OrdersStickyPanel
        phone={phone}
        folded={searchHidden}
        onFocus={reveal}
        top={
          <OrdersToolbar
            search={search}
            onSearch={setSearch}
            view={view}
            onView={setView}
            showRange={showRange}
            period={period}
            onPeriod={setPeriod}
            phone={phone}
            actions={actions}
          />
        }
      >
        {statusOpen && mobileTab && (
          <StatusHeader board={shownBoard(boardQ.data, paidNewOnly)} active={mobileTab} onBack={backToList} />
        )}
      </OrdersStickyPanel>

      {phone && showRange && (
        <div className="mt-2">
          <OrdersPeriodPicker value={period} onChange={setPeriod} />
        </div>
      )}

      <div className={phone ? "mt-3" : "mt-1"}>
        {view === "table" ? (
          <OrdersTable search={debouncedSearch} period={period} onOpen={setOpenId} />
        ) : (
          <BoardView
            search={debouncedSearch}
            boardQ={boardQ}
            closedLimit={closedLimit}
            onClosedLimit={setClosedLimit}
            period={period}
            mobileTab={mobileTab}
            onPickStatus={openStatus}
            paidNewOnly={paidNewOnly}
            onClearPaidNew={clearPaidNew}
            onOpen={openOrder}
          />
        )}
      </div>

      <OrdersMoreSheet open={moreOpen} view={view} onView={setView} onRefresh={refresh} onClose={() => setMoreOpen(false)} />

      <OrderDrawer
        orderId={openId}
        initialAction={openAction}
        onClose={() => {
          setOpenId(null);
          setOpenAction(undefined);
        }}
      />
      <NewOrderModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={setOpenId} />
    </div>
  );
}
