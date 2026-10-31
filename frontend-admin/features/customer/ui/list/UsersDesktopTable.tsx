"use client";

import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import type { SortDir } from "@/lib/sort";
import { staggerContainer, riseItem } from "@/lib/motion";
import { money } from "@/lib/money";
import { formatDateTime, timeAgo } from "@shop/core/time";
import type { UserCardDto, UserSortBy } from "../../model/types";
import { displayName, initials } from "../../model/user";
import { LangCell, SortableTh } from "./parts";

export function UsersDesktopTable({
  rows,
  loading,
  resetKey,
  sortBy,
  sortDir,
  toggleSort,
  onOpenUser,
}: {
  rows: UserCardDto[];
  loading: boolean;
  resetKey: string;
  sortBy: UserSortBy;
  sortDir: SortDir;
  toggleSort: (c: UserSortBy) => void;
  onOpenUser: (u: UserCardDto) => void;
}) {
  return (
    <div className="thin-scroll hidden overflow-x-auto md:block">
      <table className="data-table [&_td:first-child]:pl-4 [&_th:first-child]:pl-4">
        <thead>
          <tr>
            <th>Пользователь</th>
            <th>Язык</th>
            <SortableTh label="Заказы" col="ordersCount" {...{ sortBy, sortDir, toggleSort }} />
            <SortableTh label="Потрачено" col="totalSpentMinor" {...{ sortBy, sortDir, toggleSort }} />
            <th>Статус</th>
            <SortableTh label="Регистрация" col="createdAt" {...{ sortBy, sortDir, toggleSort }} />
            <SortableTh label="Был(а)" col="lastSeenAt" {...{ sortBy, sortDir, toggleSort }} />
          </tr>
        </thead>
        <motion.tbody variants={staggerContainer} initial="initial" animate="animate" key={resetKey}>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7}>
                    <Skeleton className="h-6 w-full rounded-[var(--r-sm)]" />
                  </td>
                </tr>
              ))
            : rows.map((u) => <UserTableRow key={u.telegramUserId} u={u} onOpen={() => onOpenUser(u)} />)}
        </motion.tbody>
      </table>
    </div>
  );
}

function UserTableRow({ u, onOpen }: { u: UserCardDto; onOpen: () => void }) {
  return (
    <motion.tr variants={riseItem} onClick={onOpen} className="cursor-pointer">
      <td>
        <div className="flex items-center gap-3">
          <div className="accent-tint font-display grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] text-[12px] font-bold">
            {initials(u)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-[var(--text)]">{displayName(u)}</span>
              {u.premium && <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--warn)]" />}
            </div>
            <div className="truncate text-[11px] text-[var(--text-faint)]">
              {u.username ? "@" + u.username + " · " : ""}#{u.telegramUserId}
            </div>
          </div>
        </div>
      </td>
      <td>
        <LangCell u={u} />
      </td>
      <td className="tabular text-[var(--text-muted)]">{u.ordersCount}</td>
      <td className="tabular font-semibold">{money(u.totalSpentMinor)}</td>
      <td>
        {u.botBlocked ? (
          <Badge tone="danger" dot>
            заблокировал
          </Badge>
        ) : (
          <Badge tone="ok" dot>
            активен
          </Badge>
        )}
      </td>
      <td className="tabular whitespace-nowrap text-[var(--text-muted)]">{u.createdAt ? formatDateTime(u.createdAt) : "—"}</td>
      <td className="whitespace-nowrap text-[var(--text-muted)]">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : "—"}</td>
    </motion.tr>
  );
}
