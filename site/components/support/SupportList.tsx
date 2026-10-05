"use client";

/** /account/support — my support threads, latest first, with the unread badge and «New request». */
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, LifeBuoy, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import type { SupportThread } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/button-styles";
import { useI18n } from "@/i18n/context";
import { Image } from "@/lib/image";
import { SUPPORT_KEYS, supportApi, useSupportConfig } from "@/lib/support";
import { useFmt } from "@/lib/use-fmt";
import { SupportDisabled, SupportStatusChip, threadTitle } from "./parts";

export function SupportList() {
  const { t, href } = useI18n();
  const { config, enabled, isLoading: configLoading } = useSupportConfig();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SUPPORT_KEYS.threads,
    queryFn: () => supportApi.threads(),
  });
  const threads = (data ?? []).slice().sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("support.title")}</h2>
          <p className="mt-1 max-w-xl text-[14px] text-[var(--muted)]">{t("support.lead")}</p>
        </div>
        {enabled && (
          <Link href={href("/account/support/new")} className={buttonClass("accent", "sm")}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {t("support.new")}
          </Link>
        )}
      </div>

      {!configLoading && config && !config.enabled && <SupportDisabled />}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-20" />
          ))}
        </div>
      ) : isError ? (
        <div className="nb flex flex-col items-start gap-3 p-6">
          <p className="text-[15px] font-semibold text-[var(--danger)]">{t("support.error.load")}</p>
          <Button variant="accent" size="sm" onClick={() => void refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : threads.length === 0 ? (
        <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-14 text-center">
          <LifeBuoy className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.75} />
          <p className="font-display text-[18px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("support.empty.title")}</p>
          <p className="text-[14px] font-medium text-[var(--muted)]">{t("support.empty.text")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {threads.map((th) => (
            <ThreadRow key={th.id} thread={th} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ThreadRow({ thread }: { thread: SupportThread }) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const preview = thread.lastPreview?.trim() || null;
  return (
    <li>
      <Link href={href(`/account/support/${thread.id}`)} className="nb nb-hover flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
          {thread.productImageUrl ? (
            <Image imageKey={thread.productImageUrl} alt={thread.productTitle ?? ""} size={120} className="h-full w-full" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[var(--muted)]">
              <MessageCircle className="h-6 w-6" strokeWidth={2} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="line-clamp-1 min-w-0 text-[15px] font-semibold text-[var(--ink)]">{threadTitle(thread, t)}</span>
            <SupportStatusChip status={thread.status} />
          </div>
          {preview && (
            <p className="mt-1 line-clamp-1 text-[13px] text-[var(--muted)]">
              {thread.lastSender === "CUSTOMER" ? t("support.you") : ""}
              {preview}
            </p>
          )}
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">
            {fmt.dayLabel(thread.lastMessageAt)}, {fmt.time(thread.lastMessageAt)}
          </p>
        </div>
        {thread.unreadCount > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--accent)] px-2.5 py-1 font-display text-[12px] font-bold text-[var(--accent-ink)]">
            {t("support.unread", { n: thread.unreadCount })}
          </span>
        )}
        <ChevronRight className="hidden h-5 w-5 shrink-0 text-[var(--muted)] sm:block" strokeWidth={2.5} aria-hidden />
      </Link>
    </li>
  );
}
