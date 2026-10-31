"use client";

import { motion } from "framer-motion";
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";
import { useTelegram } from "@/platform/telegram";
import { deriveInitials, displayNameOf } from "../model/profile";

/** Avatar tile, name, @username and the orders counter. */
export function ProfileCard({ ordersCount }: { ordersCount: number }) {
  const t = useT();
  const tg = useTelegram();
  const displayName = displayNameOf(tg.user, t("account.guest"));
  const initials = deriveInitials(tg.user?.firstName, tg.user?.lastName, tg.user?.username);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="nb mb-6 flex items-center gap-4 p-4"
    >
      <span
        className="font-display flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--r-card)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[20px] font-extrabold text-[var(--accent)] shadow-[0_0_18px_-4px_rgba(255,102,0,.5)]"
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display truncate text-[17px] font-bold text-[var(--ink)]">{displayName}</p>
        {tg.user?.username ? (
          <p className="truncate text-[13px] text-[var(--muted)]">@{tg.user.username}</p>
        ) : (
          <p className="truncate text-[13px] text-[var(--faint)]">Telegram Mini App</p>
        )}
      </div>
      <span className="nb-up shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
        {ordersCount > 0 ? t("account.ordersBadge", { n: ordersCount }) : "—"}
      </span>
    </motion.div>
  );
}
