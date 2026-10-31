"use client";

/** Вкладка «Детали»: загрузка / ошибка / сами детали и нижняя панель действий. */
import type { UseQueryResult } from "@tanstack/react-query";
import { QueryState } from "@/components/ui/QueryState";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AdminOrderDetail } from "../../api";
import { OrderDetails } from "../details/OrderDetails";
import type { DetailHandlers } from "../details/types";
import { ActionBar, type ActionBarProps } from "./ActionBar";

export function DetailsPane({
  query,
  handlers,
  bar,
}: {
  query: UseQueryResult<AdminOrderDetail>;
  handlers: DetailHandlers;
  bar: ActionBarProps;
}) {
  const order = query.data;
  return (
    <>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {query.isError ? (
          <QueryState isLoading={false} isError error={query.error} refetch={query.refetch}>
            {null}
          </QueryState>
        ) : query.isLoading || !order ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 rounded-[var(--r-md)]" />
            <Skeleton className="h-44 rounded-[var(--r-md)]" />
            <Skeleton className="h-32 rounded-[var(--r-md)]" />
          </div>
        ) : (
          <OrderDetails order={order} h={handlers} />
        )}
      </div>
      {order && <ActionBar {...bar} />}
    </>
  );
}
