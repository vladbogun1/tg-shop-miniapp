"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { staggerContainer, riseItem } from "@/lib/motion";
import { money } from "@/lib/money";
import { formatDateTime } from "@/lib/orders";
import type { UserCardDto } from "../../model/types";
import { displayName, initials } from "../../model/user";
import { LangCell } from "./parts";

export function UsersMobileCards({
  rows,
  resetKey,
  onOpenUser,
}: {
  rows: UserCardDto[];
  resetKey: string;
  onOpenUser: (u: UserCardDto) => void;
}) {
  return (
    <motion.div
      className="flex flex-col gap-2.5 p-4 md:hidden"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      key={`m-${resetKey}`}
    >
      {rows.map((u) => (
        <motion.button
          key={u.telegramUserId}
          type="button"
          variants={riseItem}
          whileTap={{ scale: 0.99 }}
          onClick={() => onOpenUser(u)}
          className="card card-hover nb-press flex w-full flex-col gap-2 p-3.5 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="accent-tint font-display grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] text-[12px] font-bold">
                {initials(u)}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold text-[var(--text)]">{displayName(u)}</div>
                <div className="truncate text-[11px] text-[var(--text-faint)]">
                  {u.username ? "@" + u.username + " · " : ""}#{u.telegramUserId}
                </div>
              </div>
            </div>
            {u.botBlocked ? (
              <Badge tone="danger" dot>
                заблок.
              </Badge>
            ) : (
              <Badge tone="ok" dot>
                активен
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-[12px] text-[var(--text-muted)]">
            <span>{u.ordersCount} зак.</span>
            <LangCell u={u} />
            <span className="tabular font-semibold text-[var(--text)]">{money(u.totalSpentMinor)}</span>
            {u.premium && <Crown className="h-3.5 w-3.5 text-[var(--warn)]" />}
            <span className="ml-auto">{u.createdAt ? formatDateTime(u.createdAt) : ""}</span>
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
}
