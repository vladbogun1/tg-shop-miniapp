"use client";

import { cn } from "@/lib/cn";
import type { OrderSortBy, SortDir } from "@/lib/api";
import type { AdminOrderCard } from "../../api";
import { OrderRow } from "./OrderRow";
import { OrdersTableEmpty } from "./OrdersTableEmpty";
import { SortHeader } from "./SortHeader";

interface Props {
  rows: AdminOrderCard[];
  archived: boolean;
  fetching: boolean;
  sortBy: OrderSortBy;
  sortDir: SortDir;
  onSort: (col: OrderSortBy) => void;
  onOpen: (id: string) => void;
}

/** Desktop table (from `sm`); on a phone the same rows are cards. */
export function OrdersTableDesktop({ rows, archived, fetching, sortBy, sortDir, onSort, onOpen }: Props) {
  const sort = { sortBy, sortDir, onSort };
  return (
    <div className={cn("card thin-scroll hidden overflow-x-auto p-0 transition-opacity sm:block", fetching && "opacity-70")}>
      <table className="data-table min-w-[860px] [&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
        <thead className="sticky top-0 z-10">
          <tr>
            <SortHeader col="createdAt" label="Дата" {...sort} />
            <th>Заказ</th>
            <SortHeader col="customerName" label="Клиент" {...sort} />
            <SortHeader col="totalMinor" label="Сумма" align="right" {...sort} />
            <SortHeader col="status" label="Статус" {...sort} />
            <th>Доставка</th>
            <th>Оплата</th>
            <th className="!text-center">Платёж</th>
            <th className="!text-center">Чат</th>
            <th className="r">Действие</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={onOpen} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="!px-4 !py-12">
                <OrdersTableEmpty archived={archived} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
