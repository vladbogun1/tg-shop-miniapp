"use client";

/**
 * UserProfileDrawer — right drawer (full-screen on mobile) with a user's
 * profile + ALL their orders. Click an order to open the full OrderDrawer
 * (which renders at a higher z-index, on top of this drawer).
 */
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { X, Crown, Ban, ShoppingBag, Wallet } from "lucide-react";
import { adminApi, type UserCardDto } from "@/lib/api";
import { money } from "@/lib/money";
import { formatDateTime, timeAgo, STATUS_VAR, STATUS_EMOJI, STATUS_LABEL } from "@/lib/orders";
import { OrderCard } from "@/components/orders/OrderCard";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  user: UserCardDto | null;
  onClose: () => void;
  onOpenOrder: (id: string) => void;
}

function displayName(u: UserCardDto): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || (u.username ? "@" + u.username : "#" + u.telegramUserId);
}

export function UserProfileDrawer({ user, onClose, onOpenOrder }: Props) {
  const { data: orders, isLoading } = useQuery({
    queryKey: ["user-orders", user?.telegramUserId],
    queryFn: () => adminApi.userOrders(user!.telegramUserId),
    enabled: !!user,
  });

  return (
    <AnimatePresence>
      {user && (
        <motion.div
          className="fixed inset-0 z-[60] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className="glass glass--strong relative z-10 flex h-dvh w-full flex-col sm:w-[560px]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[16px] font-bold text-[var(--text)]">
                    {displayName(user)}
                  </span>
                  {user.premium && (
                    <Badge color="#ffd60a" icon={<Crown className="h-3 w-3" />}>
                      premium
                    </Badge>
                  )}
                  {user.botBlocked && (
                    <Badge color="#ff453a" icon={<Ban className="h-3 w-3" />}>
                      заблокировал
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-[var(--text-faint)]">
                  {user.username ? "@" + user.username + " · " : ""}#{user.telegramUserId}
                  {user.languageCode ? " · " + user.languageCode : ""}
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-white/10"
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 px-5 py-4">
              <div className="rounded-[var(--r-md)] bg-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <ShoppingBag className="h-3.5 w-3.5" /> Заказов
                </div>
                <div className="mt-1 text-[18px] font-bold text-[var(--text)]">{user.ordersCount}</div>
              </div>
              <div className="rounded-[var(--r-md)] bg-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <Wallet className="h-3.5 w-3.5" /> Потрачено
                </div>
                <div className="mt-1 text-[18px] font-bold text-[var(--text)]">
                  {money(user.totalSpentMinor)}
                </div>
              </div>
            </div>
            <div className="px-5 pb-2 text-[12px] text-[var(--text-faint)]">
              {user.createdAt ? `Регистрация: ${formatDateTime(user.createdAt)}` : ""}
              {user.lastSeenAt ? ` · был(а) ${timeAgo(user.lastSeenAt)}` : ""}
            </div>

            {/* Orders */}
            <div className="thin-scroll flex-1 overflow-y-auto px-5 pb-6">
              <div className="mb-2 text-[13px] font-semibold text-[var(--text-muted)]">
                Заказы
              </div>
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-[var(--r-md)]" />
                  ))}
                </div>
              ) : (orders ?? []).length === 0 ? (
                <div className="py-10 text-center text-[13px] text-[var(--text-faint)]">
                  Заказов нет
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(orders ?? []).map((o) => (
                    <div key={o.id} className="relative">
                      <div className="absolute right-3 top-3 z-10">
                        <Badge color={STATUS_VAR[o.status]}>
                          {STATUS_EMOJI[o.status]} {STATUS_LABEL[o.status]}
                        </Badge>
                      </div>
                      <OrderCard order={o} onClick={() => onOpenOrder(o.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
