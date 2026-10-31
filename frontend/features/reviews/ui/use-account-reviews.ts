"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isCaseBonus } from "@shop/core/bonuses";
import { type BonusCode } from "@shop/core/types";
import { useAccessToken } from "@/lib/auth";
import { reviewKeys, reviewsApi } from "@/features/reviews/api";
import { reviewsScreenState } from "../model/state";

/** The three lists of the reviews screen and the flags derived from them. */
export function useAccountReviews() {
  const token = useAccessToken();

  const pending = useQuery({
    queryKey: reviewKeys.pending(),
    queryFn: () => reviewsApi.pending(),
    enabled: !!token,
  });
  const mine = useQuery({
    queryKey: reviewKeys.mine(),
    queryFn: () => reviewsApi.mine(),
    enabled: !!token,
  });
  const bonuses = useQuery({
    queryKey: reviewKeys.bonuses,
    queryFn: () => reviewsApi.bonuses(),
    // Case prize codes live in their order and the cart offer, not among the review bonuses.
    select: (list: BonusCode[]) => list.filter((b) => !isCaseBonus(b)),
    enabled: !!token,
  });

  // Keep the "waiting" section once shown: after the last review the server returns [] but the
  // card still holds the "thanks" and the bonus code.
  const [hadPending, setHadPending] = useState(false);
  const pendingCount = pending.data?.length ?? 0;
  if (pendingCount > 0 && !hadPending) setHadPending(true);
  const showPending = hadPending || pendingCount > 0;

  const { loading, failed, nothing } = reviewsScreenState({
    hasToken: !!token,
    queries: [pending, mine, bonuses],
    showPending,
    mineCount: mine.data?.length ?? 0,
    bonusCount: bonuses.data?.length ?? 0,
  });

  function refetchAll() {
    void pending.refetch();
    void mine.refetch();
    void bonuses.refetch();
  }

  return {
    pending: pending.data ?? [],
    mine: mine.data ?? [],
    bonuses: bonuses.data ?? [],
    showPending,
    loading,
    failed,
    nothing,
    refetchAll,
  };
}
