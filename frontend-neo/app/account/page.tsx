"use client";

/**
 * ACCOUNT (design doc §13.3 / SPEC FE-1): profile header + "Мои заказы".
 * GET /api/me/orders → order cards (status chip, total, date, items,
 * unread badge). Tap → order detail. Loading skeletons + error/empty states.
 *
 * NEO-BRUTALISM restyle: thick ink borders, hard offset shadows, sharp corners,
 * heavy uppercase type. Behaviour, query keys (["me","orders"]) and routes are
 * unchanged. Order cards animate in DIRECTLY (initial/animate + delay i*0.05),
 * not via variant propagation (see NEO.md framer-motion caveat).
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  MessageCircle,
  PackageOpen,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { NotificationsBell } from "@/components/NotificationsBell";
import { GlassButton } from "@/components/ui/GlassButton";
import { StatusChip } from "@/components/ui/StatusChip";
import { customerApi, type OrderSummary } from "@/lib/api";
import { formatDate, shortOrderId } from "@/lib/format";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic, useTelegram } from "@/lib/telegram";

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

  const initials = deriveInitials(
    tg.user?.firstName,
    tg.user?.lastName,
    tg.user?.username
  );

  return (
    <div className="pt-2">
      <header className="mb-4 flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="nb-up text-[26px] font-black text-[var(--ink)]">
            Аккаунт
          </h1>
          <p className="text-[13px] font-semibold text-[var(--muted)]">
            Профиль и история заказов
          </p>
        </div>
        <NotificationsBell />
      </header>

      {/* neo profile header */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="nb mb-6 flex items-center gap-4 p-4"
      >
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center border-[3px] border-[var(--line)] bg-[var(--accent)] text-[20px] font-black text-[var(--accent-ink)]"
          aria-hidden
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-extrabold text-[var(--ink)]">
            {displayName}
          </p>
          {tg.user?.username ? (
            <p className="truncate text-[13px] font-semibold text-[var(--muted)]">
              @{tg.user.username}
            </p>
          ) : (
            <p className="truncate text-[13px] font-semibold text-[var(--faint)]">
              Telegram Mini App
            </p>
          )}
        </div>
        <span className="nb-up shrink-0 border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
          {orders.length > 0 ? `${orders.length} зак.` : "—"}
        </span>
      </motion.div>

      <h2 className="nb-up mb-3 text-[13px] font-black text-[var(--muted)]">
        Мои заказы
      </h2>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-[104px] rounded-[var(--r)]" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={<WifiOff className="h-8 w-8" strokeWidth={2.5} />}
          title="Не удалось загрузить"
          text="Войдите через Telegram или проверьте подключение."
        >
          <GlassButton
            variant="accent"
            loading={isRefetching}
            onClick={() => {
              haptic();
              void refetch();
            }}
          >
            Повторить
          </GlassButton>
        </EmptyState>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <EmptyState
          icon={<PackageOpen className="h-8 w-8" strokeWidth={2.5} />}
          title="Заказов пока нет"
          text="Оформите первый заказ — он появится здесь."
        >
          <Link href="/" onClick={() => haptic()}>
            <GlassButton variant="accent">В каталог</GlassButton>
          </Link>
        </EmptyState>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((o, i) => (
            <OrderCard key={o.id} order={o} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, index }: { order: OrderSummary; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.05 }}
    >
      <Link
        href={`/account/orders/${order.id}`}
        onClick={() => haptic()}
        className="nb nb-press tap flex items-center gap-3 p-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-black text-[var(--ink)]">
              {shortOrderId(order.id)}
            </span>
            <StatusChip status={order.status} />
            {order.paid ? (
              <span className="nb-up flex items-center gap-1 border-[2.5px] border-[var(--line)] bg-[var(--c4)] px-2 py-0.5 text-[10px] font-black text-[var(--accent-ink)]">
                <Check className="h-3 w-3" strokeWidth={3} />
                Оплачен
              </span>
            ) : (
              <span className="nb-up border-[2.5px] border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-black text-[var(--muted)]">
                Не оплачен
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[13px] font-semibold text-[var(--muted)]">
            {formatDate(order.createdAt)} · {order.itemsCount} тов.
          </p>
          <span className="mt-2 inline-block border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[15px] font-black text-[var(--ink)]">
            {money(order.totalMinor, order.currency)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-2">
          {order.unreadCount > 0 && (
            <span className="nb-up flex items-center gap-1 border-[2.5px] border-[var(--line)] bg-[var(--accent)] px-2 py-0.5 text-[11px] font-black text-[var(--accent-ink)]">
              <MessageCircle className="h-3 w-3" strokeWidth={2.75} />
              {order.unreadCount > 99 ? "99+" : order.unreadCount}
            </span>
          )}
          <ChevronRight className="h-5 w-5 text-[var(--ink)]" strokeWidth={2.75} />
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="nb mt-2 flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center border-[3px] border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]">
        {icon}
      </span>
      <h3 className="nb-up text-[17px] font-black text-[var(--ink)]">{title}</h3>
      <p className="max-w-[260px] text-[13px] font-semibold text-[var(--muted)]">
        {text}
      </p>
      {children}
    </motion.div>
  );
}

/** First letters of name (or username) for the avatar tile; falls back to "?". */
function deriveInitials(
  firstName?: string,
  lastName?: string,
  username?: string
): string {
  const a = firstName?.trim()?.[0];
  const b = lastName?.trim()?.[0];
  if (a && b) return (a + b).toUpperCase();
  if (a) return a.toUpperCase();
  const u = username?.trim()?.[0];
  if (u) return u.toUpperCase();
  return "?";
}
