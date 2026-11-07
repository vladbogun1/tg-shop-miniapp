"use client";

import { motion } from "framer-motion";
import { ChevronRight, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Image } from "@/lib/image";
import { DELIVERY_LABEL } from "@/lib/delivery";
import { money } from "@/lib/money";
import { riseItem, staggerContainer } from "@/lib/motion";
import { shortOrderId as shortId } from "@shop/core/format";
import { formatDateTime } from "@shop/core/time";
import type { CustomerOrderCard } from "../../api";
import { useUserOrders } from "../../queries";

/** Список заказов покупателя: загрузка, ошибка (не «Заказов нет») и пустое состояние. */
export function ProfileOrders({ telegramUserId, onOpenOrder }: { telegramUserId: number; onOpenOrder?: (id: string) => void }) {
  const router = useRouter();
  const { data: orders, isLoading, isError, error, refetch } = useUserOrders(telegramUserId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-[var(--r-md)]" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <QueryState isLoading={false} isError error={error} refetch={refetch}>
        {null}
      </QueryState>
    );
  }
  if ((orders ?? []).length === 0) return <EmptyState icon={Package} title="Заказов нет" />;
  return (
    <motion.div className="flex flex-col gap-2" variants={staggerContainer} initial="initial" animate="animate">
      {(orders ?? []).map((o) => (
        <OrderRow key={o.id} order={o} onClick={() => (onOpenOrder ? onOpenOrder(o.id) : router.push("/orders/" + o.id))} />
      ))}
    </motion.div>
  );
}

/** Название первого товара (+N, если их больше) — по нему заказ узнают быстрее, чем по номеру. */
function orderTitle(o: CustomerOrderCard): string {
  const first = o.lines[0]?.title;
  if (!first) return `${o.itemsCount} тов.`;
  return o.itemsCount > 1 ? `${first} +${o.itemsCount - 1}` : first;
}

function OrderRow({ order, onClick }: { order: CustomerOrderCard; onClick: () => void }) {
  const img = order.lines[0]?.imageUrl;
  return (
    <motion.button
      type="button"
      variants={riseItem}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="card card-hover nb-press group flex min-h-[56px] w-full items-center gap-3 p-3 text-left"
    >
      {img ? (
        <Image src={img} alt="" size={96} className="h-11 w-11 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--line)]" />
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]">
          <Package className="h-[18px] w-[18px]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">{orderTitle(order)}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[12px] text-[var(--text-muted)]">{shortId(order.id)}</span>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-[var(--text-faint)]">
          {order.itemsCount} тов. · {order.deliveryMethod ? DELIVERY_LABEL[order.deliveryMethod] : "—"} · {formatDateTime(order.createdAt)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display tabular text-[14px] font-bold text-[var(--text)]">{money(order.totalMinor, order.currency)}</div>
        {order.unreadCount > 0 && (
          <div className="count-badge mt-1" title="Непрочитанные сообщения клиента">
            {order.unreadCount}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}
