"use client";

/**
 * «Підтримка» row on the account screen: opens the support threads (questions not about an
 * order), with the number of unread shop answers. Hidden while support is switched off.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { spring } from "@/lib/motion";
import { supportApi } from "@/lib/support";
import { haptic } from "@/lib/telegram";

export function SupportEntry() {
  const t = useT();
  const token = useAccessToken();
  const { data: config } = useQuery({
    queryKey: ["me", "support", "config"],
    queryFn: () => supportApi.config(),
    enabled: !!token,
    staleTime: 60_000,
  });
  const { data: unread } = useQuery({
    queryKey: ["me", "support", "unread"],
    queryFn: () => supportApi.unreadCount(),
    enabled: !!token,
    refetchInterval: 60_000,
  });
  const count = unread?.count ?? 0;
  // Keep the row for someone with unread answers even if support was switched off meanwhile.
  if (config && !config.enabled && count === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mb-6">
      <Link
        href="/account/support"
        onClick={() => haptic()}
        className="nb nb-press tap flex items-center gap-3 p-4"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
          <LifeBuoy className="h-5 w-5" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-[15px] font-bold text-[var(--ink)]">{t("support.entry")}</span>
          <span className="block truncate text-[12.5px] text-[var(--muted)]">{t("support.entryHint")}</span>
        </span>
        {count > 0 && (
          <span className="font-display rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-ink)] shadow-[0_0_10px_rgba(255,102,0,.5)]">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <ChevronRight className="h-5 w-5 text-[var(--faint)]" strokeWidth={2.25} />
      </Link>
    </motion.div>
  );
}
