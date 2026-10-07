"use client";

/**
 * List of delivered lines waiting for a review.
 *
 * Submitting a review invalidates the pending query, and the server stops returning that line — so
 * a plain `data.map` would make the card (with its "thanks" and bonus code) vanish the moment it
 * appears. Lines already on screen therefore stay where they are until the list is remounted.
 */
import { useMemo, useRef } from "react";
import type { PendingReviewLine } from "@/lib/reviews";
import { PendingReviewCard } from "./ReviewForm";

export function PendingReviewList({ lines }: { lines: PendingReviewLine[] }) {
  const seen = useRef<Map<number, PendingReviewLine>>(new Map());
  const shown = useMemo(() => {
    for (const l of lines) seen.current.set(l.orderItemId, l);
    return Array.from(seen.current.values());
  }, [lines]);

  return (
    <div className="flex flex-col gap-3">
      {shown.map((l, i) => (
        <PendingReviewCard key={l.orderItemId} line={l} index={i} />
      ))}
    </div>
  );
}
