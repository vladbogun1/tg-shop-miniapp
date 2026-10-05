"use client";

/** Account screen entry «Відгуки» → /account/reviews, with a badge of lines waiting for a review. */
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { reviewKeys, reviewsApi } from "@/lib/reviews";
import { haptic } from "@/lib/telegram";

export function AccountReviewsLink() {
  const t = useT();
  const token = useAccessToken();
  const { data } = useQuery({
    queryKey: reviewKeys.pending(),
    queryFn: () => reviewsApi.pending(),
    enabled: !!token,
    staleTime: 60_000,
  });
  const waiting = data?.length ?? 0;

  return (
    <Link
      href="/account/reviews"
      onClick={() => haptic()}
      className="nb nb-press tap mb-3 flex items-center gap-3 p-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
        <MessageSquareText className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold text-[var(--ink)]">{t("reviews.account.title")}</p>
        <p className="truncate text-[12px] text-[var(--muted)]">
          {waiting > 0 ? t("reviews.account.waiting", { n: waiting }) : t("reviews.account.subtitle")}
        </p>
      </div>
      {waiting > 0 && (
        <span className="font-display rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-ink)]">
          {waiting}
        </span>
      )}
      <ChevronRight className="h-5 w-5 text-[var(--faint)]" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
