"use client";

/**
 * ACCOUNT → REVIEWS (Phase C): lines waiting for a review (with the form), "My reviews" with a
 * moderation status chip, the shop's reply and editing while still on moderation, and "My bonuses"
 * (personal review-bonus promo codes) with a copy button.
 */
import { motion } from "framer-motion";
import { ArrowLeft, MessageSquareText, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";
import { spring } from "@/lib/motion";
import { haptic } from "@/platform/telegram";
import { ReviewsSections } from "./ReviewsSections";
import { useAccountReviews } from "./use-account-reviews";

function ReviewsHeader() {
  const t = useT();
  const router = useRouter();
  return (
    <header
      className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 backdrop-blur-[12px]"
      style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
    >
      <button
        type="button"
        aria-label={t("common.back")}
        onClick={() => {
          haptic();
          router.push("/account");
        }}
        className="tap nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <h1 className="nb-up flex-1 truncate text-[18px] font-extrabold text-[var(--ink)]">
        {t("reviews.account.title")}
      </h1>
    </header>
  );
}

function ReviewsError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="nb hud-frame flex flex-col items-center gap-3 px-6 py-12 text-center">
      <WifiOff className="h-8 w-8 text-[var(--accent)]" strokeWidth={2.25} />
      <p className="text-[14px] text-[var(--muted)]">{t("reviews.account.error")}</p>
      <Button
        variant="accent"
        onClick={() => {
          haptic();
          onRetry();
        }}
      >
        {t("common.retry")}
      </Button>
    </div>
  );
}

function ReviewsEmpty() {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="nb hud-frame flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
        <MessageSquareText className="h-8 w-8" strokeWidth={2.5} />
      </span>
      <h3 className="nb-up text-[17px] font-extrabold text-[var(--ink)]">{t("reviews.account.empty.title")}</h3>
      <p className="max-w-[260px] text-[13px] text-[var(--muted)]">{t("reviews.account.empty.text")}</p>
      <Link href="/account" onClick={() => haptic()}>
        <Button variant="accent">{t("reviews.account.toOrders")}</Button>
      </Link>
    </motion.div>
  );
}

export function AccountReviewsScreen() {
  const r = useAccountReviews();
  return (
    <div className="pt-2 pb-6">
      <ReviewsHeader />

      {r.loading && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-28 rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {!r.loading && r.failed && <ReviewsError onRetry={r.refetchAll} />}

      {r.nothing && <ReviewsEmpty />}

      {!r.loading && !r.failed && !r.nothing && (
        <ReviewsSections pending={r.pending} showPending={r.showPending} mine={r.mine} bonuses={r.bonuses} />
      )}
    </div>
  );
}
