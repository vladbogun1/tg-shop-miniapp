"use client";

/**
 * UserProfileDrawer (Neo-Brutalism) — right drawer with a user's profile + ALL
 * their orders (GET /api/admin/orders/by-user/{tgId}).
 *
 * Decoupling: clicking an order row navigates to the dedicated order route
 * (`/orders/{id}`) via the router — this drawer never imports OrderDrawer.
 */
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Crown,
  Ban,
  ShoppingBag,
  Wallet,
  Send,
  Package,
  ChevronRight,
} from "lucide-react";
import { adminApi, type UserCardDto, type OrderCardDto } from "@/lib/api";
import { money } from "@/lib/money";
import {
  formatDateTime,
  timeAgo,
  shortId,
  DELIVERY_LABEL,
} from "@/lib/orders";
import { Drawer } from "@/components/ui/Drawer";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { staggerContainer, riseItem, spring } from "@/lib/motion";

interface Props {
  user: UserCardDto | null;
  onClose: () => void;
}

function displayName(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : "#" + u.telegramUserId);
}

function initials(u: UserCardDto): string {
  const a = u.firstName?.trim()?.[0] ?? u.username?.trim()?.[0] ?? "";
  const b = u.lastName?.trim()?.[0] ?? "";
  const both = (a + b).toUpperCase();
  return both || String(u.telegramUserId).slice(0, 2);
}

function telegramHref(u: UserCardDto): string {
  return u.username ? `https://t.me/${u.username}` : `tg://user?id=${u.telegramUserId}`;
}

export function UserProfileDrawer({ user, onClose }: Props) {
  const router = useRouter();

  const { data: orders, isLoading } = useQuery({
    queryKey: ["user-orders", user?.telegramUserId],
    queryFn: () => adminApi.userOrders(user!.telegramUserId),
    enabled: !!user,
  });

  const header = user ? (
    <div className="flex min-w-0 items-center gap-3">
      <div className="accent-fill grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-sm)] text-[14px] font-extrabold text-[var(--accent-ink)]">
        {initials(user)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[16px] font-extrabold uppercase tracking-wide text-[var(--text)]">
            {displayName(user)}
          </span>
          {user.premium && (
            <Badge tone="warn">
              <Crown className="h-3 w-3" /> premium
            </Badge>
          )}
          {user.botBlocked && (
            <Badge tone="danger">
              <Ban className="h-3 w-3" /> заблокировал
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">
          {user.username ? "@" + user.username + " · " : ""}#{user.telegramUserId}
          {user.languageCode ? " · " + user.languageCode : ""}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <Drawer open={!!user} onClose={onClose} header={header} width="max-w-2xl">
      {user && (
        <div className="flex flex-col gap-5 p-5">
          {/* Telegram link */}
          <a
            href={telegramHref(user)}
            target="_blank"
            rel="noreferrer"
            className="focusable card-2 nb-press inline-flex w-fit items-center gap-2 px-3.5 py-2 text-[13px] font-extrabold uppercase tracking-wide text-[var(--text)] shadow-[4px_4px_0_var(--shadow)]"
          >
            <Send className="h-4 w-4 text-[var(--accent)]" />
            Открыть в Telegram
          </a>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                <ShoppingBag className="h-3.5 w-3.5" /> Заказов
              </div>
              <div className="mt-1.5 text-[22px] font-extrabold text-[var(--text)]">
                {user.ordersCount}
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                <Wallet className="h-3.5 w-3.5" /> Потрачено
              </div>
              <div className="mt-1.5 text-[22px] font-extrabold text-[var(--text)]">
                {money(user.totalSpentMinor)}
              </div>
            </div>
          </div>

          <div className="text-[12px] text-[var(--text-faint)]">
            {user.createdAt ? `Регистрация: ${formatDateTime(user.createdAt)}` : ""}
            {user.lastSeenAt ? ` · был(а) ${timeAgo(user.lastSeenAt)}` : ""}
          </div>

          {/* Orders */}
          <div>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-4 w-1.5 bg-[var(--accent)]" />
              <span className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--text)]">
                Заказы
              </span>
            </div>
            {isLoading ? (
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[88px] rounded-[var(--r-md)]" />
                ))}
              </div>
            ) : (orders ?? []).length === 0 ? (
              <EmptyState icon={Package} title="Заказов нет" />
            ) : (
              <motion.div
                className="flex flex-col gap-2.5"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {(orders ?? []).map((o) => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    onClick={() => router.push("/orders/" + o.id)}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function OrderRow({
  order,
  onClick,
}: {
  order: OrderCardDto;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      variants={riseItem}
      whileHover={{ y: -2, transition: spring }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="card nb-press group flex w-full items-center gap-3 p-3.5 text-left"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)]">
        <Package className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-extrabold text-[var(--text)]">
            {shortId(order.id)}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">
          {order.itemsCount} тов. · {DELIVERY_LABEL[order.deliveryMethod]} ·{" "}
          {formatDateTime(order.createdAt)}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[14px] font-extrabold text-[var(--text)]">
          {money(order.totalMinor, order.currency)}
        </div>
        {order.unreadCount > 0 && (
          <div className="mt-1 inline-flex items-center justify-center rounded-full border-2 border-[var(--line)] bg-[var(--accent)] px-1.5 text-[11px] font-bold text-[var(--accent-ink)]">
            {order.unreadCount}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}
