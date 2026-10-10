"use client";

/**
 * UserProfileDrawer (ChiSetup v3) — right drawer with a user's profile + ALL
 * their orders (GET /api/admin/orders/by-user/{tgId}).
 *
 * Decoupling: clicking an order row calls `onOpenOrder` — the page opens the OrderDrawer ON TOP of
 * this one, so closing the order returns here (it used to navigate away to `/orders/{id}` and the
 * list lost its search and page). Without `onOpenOrder` it falls back to that route.
 */
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { LANG_LABEL, type ShopLang, type UserCard } from "@/lib/api-extra";
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
import { QueryState } from "@/components/ui/QueryState";
import { staggerContainer, riseItem } from "@/lib/motion";

interface Props {
  user: UserCardDto | null;
  onClose: () => void;
  /** Open an order over the profile (the users page renders the OrderDrawer). */
  onOpenOrder?: (orderId: string) => void;
}

/** «пишет на: Украинский» — the language to answer in (users.locale, else Telegram's). */
function languageLine(u: UserCard): string {
  if (u.locale) return "язык магазина: " + (LANG_LABEL[u.locale as ShopLang] ?? u.locale);
  if (u.languageCode) return "язык Telegram: " + u.languageCode;
  return "";
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

export function UserProfileDrawer({ user, onClose, onOpenOrder }: Props) {
  const router = useRouter();

  const { data: orders, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["user-orders", user?.telegramUserId],
    queryFn: () => adminApi.userOrders(user!.telegramUserId),
    enabled: !!user,
  });

  const header = user ? (
    <div className="flex min-w-0 items-center gap-3">
      <div className="accent-tint font-display grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] text-[14px] font-bold">
        {initials(user)}
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-display truncate text-[17px] font-bold leading-tight text-[var(--ink)]">
            {displayName(user)}
          </span>
          {user.premium && (
            <Badge tone="warn" className="shrink-0">
              <Crown className="h-3 w-3" /> premium
            </Badge>
          )}
          {user.botBlocked && (
            <Badge tone="danger" className="shrink-0">
              <Ban className="h-3 w-3" /> заблокировал
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">
          {user.username ? "@" + user.username + " · " : ""}#{user.telegramUserId}
          {languageLine(user as UserCard) ? " · " + languageLine(user as UserCard) : ""}
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
            className="focusable nb-press font-display inline-flex h-10 w-fit items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-2)] bg-[var(--surface-2)] px-4 text-[12.5px] font-bold uppercase tracking-[0.06em] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
          >
            <Send className="h-4 w-4 text-[var(--accent)]" />
            Открыть в Telegram
          </a>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="field-label flex items-center gap-1.5 !text-[11px]">
                <ShoppingBag className="h-3.5 w-3.5" /> Заказов
              </div>
              <div className="kpi-num mt-2 text-[24px]">
                {user.ordersCount}
              </div>
            </div>
            <div className="card p-4">
              <div className="field-label flex items-center gap-1.5 !text-[11px]">
                <Wallet className="h-3.5 w-3.5" /> Потрачено
              </div>
              <div className="kpi-num mt-2 text-[24px]">
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
            <h3 className="section-title mb-2.5 flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
              Заказы
            </h3>
            {isLoading ? (
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[88px] rounded-[var(--r-md)]" />
                ))}
              </div>
            ) : isError ? (
              // A failed load is not «Заказов нет».
              <QueryState isLoading={false} isError error={error} refetch={refetch}>
                {null}
              </QueryState>
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
                    onClick={() => (onOpenOrder ? onOpenOrder(o.id) : router.push("/orders/" + o.id))}
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
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="card card-hover nb-press group flex w-full items-center gap-3 p-3.5 text-left"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]">
        <Package className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[13px] font-semibold text-[var(--text)]">
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
        <div className="font-display tabular text-[14px] font-bold text-[var(--text)]">
          {money(order.totalMinor, order.currency)}
        </div>
        {order.unreadCount > 0 && (
          <div className="count-badge mt-1">
            {order.unreadCount}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform group-hover:translate-x-0.5" />
    </motion.button>
  );
}
