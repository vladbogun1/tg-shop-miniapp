"use client";

/**
 * SUPPORT — the customer's questions to the shop that are not about an order (V43).
 * GET /api/me/support/threads → cards (product thumb or "general question", last message, time,
 * status, unread badge). Tap → /account/support/{id}/chat; «Поставити питання» →
 * /account/support/new/chat (a general question).
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight, LifeBuoy, MessageCircle, Plus, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { Image } from "@/lib/image";
import { spring } from "@/lib/motion";
import { supportApi, type SupportThread } from "@/lib/support";
import { haptic } from "@/lib/telegram";

export default function SupportListPage() {
  const t = useT();
  const router = useRouter();
  const token = useAccessToken();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["me", "support", "threads"],
    queryFn: () => supportApi.threads(),
    enabled: !!token,
    refetchInterval: 30_000,
  });
  const { data: config } = useQuery({
    queryKey: ["me", "support", "config"],
    queryFn: () => supportApi.config(),
    enabled: !!token,
    staleTime: 60_000,
  });
  const loading = isLoading || !token;
  const threads = data ?? [];
  const enabled = config?.enabled ?? true;

  return (
    <div className="pt-2">
      <header className="mb-4 flex items-center gap-3 pt-2">
        <motion.button
          type="button"
          aria-label={t("common.back")}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.07 }}
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap flex shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </motion.button>
        <div className="min-w-0 flex-1">
          <h1 className="nb-up text-[24px] font-extrabold text-[var(--ink)]">{t("support.title")}</h1>
          <p className="text-[13px] text-[var(--muted)]">{t("support.subtitle")}</p>
        </div>
      </header>

      {enabled ? (
        <Link
          href="/account/support/new/chat"
          onClick={() => haptic()}
          className="nb-accent nb-press tap nb-up mb-5 flex items-center justify-center gap-2 px-4 py-3 text-[14px]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.75} />
          {t("support.new")}
        </Link>
      ) : (
        <p className="nb mb-5 px-4 py-3 text-center text-[13px] text-[var(--muted)]">{t("support.disabled")}</p>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-[84px] rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="nb hud-frame mt-2 flex flex-col items-center gap-3 px-6 py-10 text-center">
          <WifiOff className="h-7 w-7 text-[var(--accent)]" strokeWidth={2.25} />
          <p className="text-[13px] text-[var(--muted)]">{t("support.error")}</p>
          <Button
            variant="accent"
            loading={isRefetching}
            onClick={() => {
              haptic();
              void refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}

      {!loading && !isError && threads.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb hud-frame mt-2 flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
            <LifeBuoy className="h-8 w-8" strokeWidth={2.25} />
          </span>
          <h3 className="nb-up text-[17px] font-extrabold text-[var(--ink)]">{t("support.empty.title")}</h3>
          <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{t("support.empty.text")}</p>
        </motion.div>
      )}

      {!loading && !isError && threads.length > 0 && (
        <div className="flex flex-col gap-3">
          {threads.map((th, i) => (
            <ThreadCard key={th.id} thread={th} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadCard({ thread, index }: { thread: SupportThread; index: number }) {
  const t = useT();
  const title = thread.productTitle || thread.subject || t("support.general");
  const closed = thread.status === "CLOSED";
  const preview =
    (thread.lastSender === "CUSTOMER" ? t("support.you") : "") + (thread.lastPreview ?? "");
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.05 }}
    >
      <Link
        href={`/account/support/${thread.id}/chat`}
        onClick={() => haptic()}
        className={`nb nb-press tap flex items-center gap-3 p-3.5 ${closed ? "opacity-70" : ""}`}
      >
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
          {thread.productImageUrl ? (
            <Image src={thread.productImageUrl} alt={title} size={120} className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[var(--accent)]">
              <LifeBuoy className="h-5 w-5" strokeWidth={2.25} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display truncate text-[14px] font-bold text-[var(--ink)]">{title}</span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[var(--muted)]">{preview || "—"}</p>
          <p className="mt-1 flex items-center gap-2 text-[11px] text-[var(--faint)]">
            <span
              className={`rounded-full border px-2 py-[1px] font-semibold ${
                closed
                  ? "border-[var(--line)] text-[var(--faint)]"
                  : "border-[var(--accent)] text-[var(--accent)]"
              }`}
            >
              {t(`support.status.${thread.status}`)}
            </span>
            {timeAgo(thread.lastMessageAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {thread.unreadCount > 0 && (
            <span className="font-display flex items-center gap-1 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-ink)] shadow-[0_0_10px_rgba(255,102,0,.5)]">
              <MessageCircle className="h-3 w-3" strokeWidth={2.75} />
              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
            </span>
          )}
          <ChevronRight className="h-5 w-5 text-[var(--faint)]" strokeWidth={2.25} />
        </div>
      </Link>
    </motion.div>
  );
}
