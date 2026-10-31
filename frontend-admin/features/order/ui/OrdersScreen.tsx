"use client";

/**
 * Orders (route "/"): the board and the table over one search / period, the order drawer and
 * the «Новый заказ» window. Board mechanics (drag, statuses, closed columns) live in ui/board.
 */
import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDebounced } from "@/lib/use-debounced";
import { useIsDesktop } from "@/lib/use-media";
import { orderKeys } from "../keys";
import { isClosedColumn, parseBoardLink } from "../model/board";
import type { BoardKey } from "../model/status";
import type { OrdersView } from "../model/view";
import { useRefreshOrders } from "../queries/board";
import { BoardView } from "./board/BoardView";
import type { OpenAction } from "./board/use-board-moves";
import { OrderDrawer } from "./drawer/OrderDrawer";
import { NewOrderModal } from "./new-order/NewOrderModal";
import { NewOrderButton, OrdersToolbar, RefreshButton } from "./OrdersToolbar";
import { OrdersTable } from "./table/OrdersTable";
import { useOrdersPeriod } from "./use-orders-period";

export function OrdersScreen() {
  const isDesktop = useIsDesktop();
  const refresh = useRefreshOrders();
  const fetching = useIsFetching({ queryKey: orderKeys.board() }) > 0;
  const [view, setView] = useState<OrdersView>("board");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useOrdersPeriod();
  const [mobileTab, setMobileTab] = useState<BoardKey>("NEW");
  const [openId, setOpenId] = useState<string | null>(null);
  /** What the drawer opens with: the return wizard / «Посылка вернулась» (from «Едет назад»). */
  const [openAction, setOpenAction] = useState<OpenAction | undefined>(undefined);
  const [newOpen, setNewOpen] = useState(false);

  // «Сегодня» links land here as /?status=NEW or /?payment=paid. Read once from the URL (no
  // useSearchParams: it would force a Suspense boundary around the whole board).
  const [paidNewOnly, setPaidNewOnly] = useState(false);
  useEffect(() => {
    const link = parseBoardLink(window.location.search);
    if (link.tab) setMobileTab(link.tab);
    if (link.paidNewOnly) setPaidNewOnly(true);
  }, []);
  function clearPaidNew() {
    setPaidNewOnly(false);
    window.history.replaceState(null, "", window.location.pathname);
  }

  // Debounced so typing does not fire a board load per keystroke.
  const debouncedSearch = useDebounced(search);

  function openOrder(id: string, action?: OpenAction) {
    setOpenAction(action);
    setOpenId(id);
  }

  // The period matters only for the closed columns / the table.
  const showRange = view === "table" || isDesktop || isClosedColumn(mobileTab);

  const refreshButton = <RefreshButton spinning={fetching} onClick={refresh} />;
  const newOrderButton = <NewOrderButton onClick={() => setNewOpen(true)} />;

  return (
    <div>
      {/* On a phone the title is already in the shell header — no second one. */}
      <div className="hidden lg:block">
        <PageHeader
          title="Заказы"
          subtitle="Управляйте заказами на доске или в таблице"
          actions={
            <>
              {refreshButton}
              {newOrderButton}
            </>
          }
        />
      </div>

      <OrdersToolbar
        search={search}
        onSearch={setSearch}
        view={view}
        onView={setView}
        showRange={showRange}
        period={period}
        onPeriod={setPeriod}
        phoneActions={
          <>
            {refreshButton}
            {newOrderButton}
          </>
        }
      />

      {view === "table" ? (
        <OrdersTable search={debouncedSearch} period={period} onOpen={setOpenId} />
      ) : (
        <BoardView
          search={debouncedSearch}
          period={period}
          mobileTab={mobileTab}
          onMobileTab={setMobileTab}
          paidNewOnly={paidNewOnly}
          onClearPaidNew={clearPaidNew}
          onOpen={openOrder}
        />
      )}

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
