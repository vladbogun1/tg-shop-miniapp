"use client";

/**
 * ACCOUNT (design doc §13.3 / SPEC FE-1): profile header + "Мои заказы".
 * GET /api/me/orders → glass order cards (status chip, total, date, items,
 * unread badge). Tap → order detail. Loading skeletons + error/empty states.
 */
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageCircle, PackageOpen, User, WifiOff } from "lucide-react";
import Link from "next/link";
import { NotificationsBell } from "@/components/NotificationsBell";
import { GlassButton } from "@/components/ui/GlassButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { customerApi, type OrderSummary } from "@/lib/api";
import { formatDate, shortOrderId } from "@/lib/format";
import { money } from "@/lib/money";
import { useTelegram } from "@/lib/telegram";

export default function AccountPage() {
  const tg = useTelegram();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["me", "orders"],
    queryFn: () => customerApi.getOrders(),
  });
  const orders = data ?? [];
  const displayName =
    [tg.user?.firstName, tg.user?.lastName].filter(Boolean).join(" ") ||
    tg.user?.username ||
    "Гость";

  return (
    <div className="pt-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--text)]">
          Аккаунт
        </h1>
        <NotificationsBell />
      </div>

      {/* profile */}
      <div className="glass mb-5 flex items-center gap-3 rounded-[var(--r-md)] p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-[var(--accent)]">
          <User className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[16px] font-semibold text-[var(--text)]">
            {displayName}
          </p>
          {tg.user?.username && (
            <p className="text-[13px] text-[var(--text-muted)]">
              @{tg.user.username}
            </p>
          )}
        </div>
      </div>

      <h2 className="mb-3 text-[15px] font-semibold text-[var(--text-muted)]">
        Мои заказы
      </h2>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-24 rounded-[var(--r-md)]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="glass flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-12 text-center">
          <WifiOff className="h-8 w-8 text-[var(--text-muted)]" />
          <h3 className="text-[16px] font-semibold text-[var(--text)]">
            Не удалось загрузить
          </h3>
          <p className="max-w-[260px] text-[13px] text-[var(--text-muted)]">
            Войдите через Telegram или проверьте подключение.
          </p>
          <GlassButton variant="accent" loading={isRefetching} onClick={() => refetch()}>
            Повторить
          </GlassButton>
        </div>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="glass flex flex-col items-center gap-3 rounded-[var(--r-lg)] px-6 py-12 text-center">
          <PackageOpen className="h-8 w-8 text-[var(--text-muted)]" />
          <h3 className="text-[16px] font-semibold text-[var(--text)]">
            Заказов пока нет
          </h3>
          <p className="max-w-[260px] text-[13px] text-[var(--text-muted)]">
            Оформите первый заказ — он появится здесь.
          </p>
          <Link href="/">
            <GlassButton variant="accent">В каталог</GlassButton>
          </Link>
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  return (
    <Link href={`/account/orders/${order.id}`} className="block">
      <div className="glass flex items-center gap-3 rounded-[var(--r-md)] p-4 transition-colors active:bg-white/5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-[var(--text)]">
              {shortOrderId(order.id)}
            </span>
            <StatusChip status={order.status} />
          </div>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {formatDate(order.createdAt)} · {order.itemsCount} тов.
          </p>
          <p className="mt-1 text-[16px] font-bold text-[var(--accent)]">
            {money(order.totalMinor, order.currency)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {order.unreadCount > 0 && (
            <span className="glossy flex items-center gap-1 rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-bold">
              <MessageCircle className="h-3 w-3" />
              {order.unreadCount}
            </span>
          )}
          <ChevronRight className="h-5 w-5 text-[var(--text-faint)]" />
        </div>
      </div>
    </Link>
  );
}
