"use client";

import { Gift } from "lucide-react";
import { BonusCodeCard } from "@/components/reviews/ReviewForm";
import { PendingReviewList } from "@/components/reviews/PendingReviewList";
import { useT } from "@/i18n/context";
import type { MyReview } from "@/lib/reviews";
import type { BonusCode } from "@shop/core/types";
import { MyReviewCard } from "./MyReviewCard";

type Pending = Parameters<typeof PendingReviewList>[0]["lines"];

/** Lines waiting for a review, with the form. */
function PendingSection({ lines }: { lines: Pending }) {
  const t = useT();
  return (
    <section>
      <h2 className="eyebrow mb-1 px-0.5">{t("reviews.account.pending")}</h2>
      <p className="mb-3 px-0.5 text-[12px] text-[var(--muted)]">{t("reviews.order.text")}</p>
      <PendingReviewList lines={lines} />
    </section>
  );
}

function MineSection({ reviews }: { reviews: MyReview[] }) {
  const t = useT();
  return (
    <section>
      <h2 className="eyebrow mb-3 px-0.5">{t("reviews.account.mine")}</h2>
      <div className="flex flex-col gap-3">
        {reviews.map((r, i) => (
          <MyReviewCard key={r.id} review={r} index={i} />
        ))}
      </div>
    </section>
  );
}

function BonusesSection({ bonuses }: { bonuses: BonusCode[] }) {
  const t = useT();
  return (
    <section>
      <h2 className="eyebrow mb-3 flex items-center gap-2 px-0.5">
        <Gift className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        {t("reviews.account.bonuses")}
      </h2>
      <div className="flex flex-col gap-2">
        {bonuses.map((b) => (
          <BonusCodeCard key={b.code} bonus={b} />
        ))}
      </div>
      <p className="mt-2 px-0.5 text-[11px] text-[var(--faint)]">{t("reviews.bonus.howTo")}</p>
    </section>
  );
}

/** Pending reviews, my reviews and review bonuses — each shown only when it has something. */
export function ReviewsSections({
  pending,
  showPending,
  mine,
  bonuses,
}: {
  pending: Pending;
  showPending: boolean;
  mine: MyReview[];
  bonuses: BonusCode[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {showPending && <PendingSection lines={pending} />}
      {mine.length > 0 && <MineSection reviews={mine} />}
      {bonuses.length > 0 && <BonusesSection bonuses={bonuses} />}
    </div>
  );
}
