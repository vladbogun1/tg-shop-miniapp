"use client";

import { Button } from "@shop/ui/admin-button";
import { useApiMutation } from "@shop/ui/mutation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCheck } from "lucide-react";
import Link from "next/link";
import { inboxKeys } from "../keys";
import type { InboxOrderSlot } from "../model/order-slot";
import type { InboxGroup } from "../model/types";

const LINK_CLASS =
  "focusable font-display inline-flex h-8 items-center gap-1.5 rounded-[var(--r-sm)] px-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] pointer-coarse:h-9";

function ReadAllChats({ order }: { order: InboxOrderSlot }) {
  const qc = useQueryClient();
  const refetch = () => void qc.invalidateQueries({ queryKey: inboxKeys.all() });
  const readAll = useApiMutation({
    mutationFn: () => order.markAllRead(),
    success: (res) => `Отмечено прочитанными: ${res?.marked ?? 0}`,
    errorFallback: "Не удалось отметить",
    invalidate: [order.boardKey],
    onSuccess: refetch,
    onError: refetch,
  });
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={readAll.isPending}
      icon={<CheckCheck className="h-4 w-4" />}
      onClick={() => readAll.mutate()}
    >
      Прочитать всё
    </Button>
  );
}

/** The one extra control in a group header: «Прочитать всё» for chats, a shortcut for stock / site errors. */
export function GroupAction({ group, order }: { group: InboxGroup; order: InboxOrderSlot }) {
  if (group.id === "CHAT" && group.items.length > 1) return <ReadAllChats order={order} />;
  if (group.id === "LOW_STOCK") {
    return (
      <Link href="/metrics?tab=stock" className={LINK_CLASS}>
        Что дозаказать <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  if (group.id === "SITE_ERROR") {
    return (
      <Link href="/settings#site" className={LINK_CLASS}>
        Настройки → Сайт <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  return null;
}
