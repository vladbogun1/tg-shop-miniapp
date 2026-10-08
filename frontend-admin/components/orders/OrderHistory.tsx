"use client";

/** "История" tab of the order card: who changed what, from the admin action log. */
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { ordersApi } from "@/lib/orders-api";
import { formatDateTime } from "@/lib/orders";
import { QueryState } from "@/components/ui/QueryState";
import { EmptyState } from "@/components/ui/EmptyState";
import { readableAuditDetails } from "@/lib/audit";

const ACTION_LABEL: Record<string, string> = {
  ORDER_STATUS: "Статус",
  ORDER_PAID: "Оплата",
  ORDER_GIFT: "Подарок",
  ORDER_ITEM_ADD: "Позиция добавлена",
  ORDER_ITEM_QTY: "Количество",
  ORDER_ITEM_REMOVE: "Позиция удалена",
  ORDER_DISCOUNT: "Скидка",
  ORDER_TRACKING: "ТТН изменена",
  ORDER_DELIVERY: "Получатель / доставка",
  ORDER_RETURN: "Возврат",
  ORDER_EXCHANGE: "Обмен",
  ORDER_DELETE: "Удаление",
};

export function OrderHistory({ orderId }: { orderId: string }) {
  const q = useQuery({
    queryKey: ["order-audit", orderId],
    queryFn: () => ordersApi.orderAudit(orderId),
  });

  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загружаем историю…">
      {!q.data || q.data.length === 0 ? (
        <EmptyState
          icon={History}
          title="Пока пусто"
          description="Здесь появятся действия админов с этим заказом: статусы, оплата, состав, ТТН."
        />
      ) : (
        <ol className="flex flex-col gap-2.5">
          {q.data.map((e) => (
            <li key={e.id} className="card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="section-title">
                  {ACTION_LABEL[e.action] ?? e.action}
                </span>
                <span className="tabular text-[11px] text-[var(--text-faint)]">{formatDateTime(e.createdAt)}</span>
              </div>
              {e.details && <p className="mt-1 break-words text-[13px] text-[var(--text-muted)]">{readableAuditDetails(e.details)}</p>}
              <p className="mt-1.5 text-[11.5px] font-medium text-[var(--text-faint)]">{e.adminName ?? `#${e.adminId}`}</p>
            </li>
          ))}
        </ol>
      )}
    </QueryState>
  );
}
