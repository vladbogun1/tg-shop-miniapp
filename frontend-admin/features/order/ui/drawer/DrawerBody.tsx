"use client";

/**
 * Тело карточки заказа: вкладки (на телефоне — отдельной строкой), «Детали» / «Чат» / «История»
 * и, от 1360 px, чат справа постоянной колонкой.
 */
import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "@/lib/cn";
import type { AdminOrderDetail } from "../../api";
import { ChatContext } from "../chat/ChatContext";
import { OrderChat } from "../chat/OrderChat";
import { OrderHistory } from "../details/OrderHistory";
import type { DetailHandlers } from "../details/types";
import type { ActionBarProps } from "./ActionBar";
import { DetailsPane } from "./DetailsPane";

type Tab = "details" | "chat" | "history";

interface Props {
  orderId: string | null;
  orderQ: UseQueryResult<AdminOrderDetail>;
  order: AdminOrderDetail | undefined;
  view: Tab;
  twoCols: boolean;
  /** Вкладки отдельной строкой (телефон); на ≥ sm они в шапке — тогда undefined. */
  tabs: ReactNode;
  handlers: DetailHandlers;
  bar: ActionBarProps;
  setTab: (t: Tab) => void;
}

export function DrawerBody({ orderId, orderQ, order, view, twoCols, tabs, handlers, bar, setTab }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {tabs}
      <div className={cn("flex min-h-0 flex-1", twoCols ? "flex-row" : "flex-col")}>
        <div className={cn("flex min-h-0 flex-1 flex-col", twoCols && "min-w-0")}>
          {view === "details" && <DetailsPane query={orderQ} handlers={handlers} bar={bar} />}

          {view === "chat" && (
            <div className="flex min-h-0 flex-1 flex-col p-3 pb-[calc(12px+var(--safe-bottom))] sm:p-5 sm:pb-[calc(20px+var(--safe-bottom))]">
              <ChatContext order={order} onOpenDetails={() => setTab("details")} />
              <div className="flex min-h-0 flex-1">{orderId && <OrderChat key={orderId} orderId={orderId} />}</div>
            </div>
          )}

          {view === "history" && (
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{orderId && <OrderHistory orderId={orderId} />}</div>
          )}
        </div>

        {twoCols && (
          <aside
            aria-label="Чат с клиентом"
            className="flex min-h-0 w-[420px] shrink-0 border-l border-[var(--line)] p-4 pb-[calc(16px+var(--safe-bottom))]"
          >
            {orderId && <OrderChat key={orderId} orderId={orderId} />}
          </aside>
        )}
      </div>
    </div>
  );
}
