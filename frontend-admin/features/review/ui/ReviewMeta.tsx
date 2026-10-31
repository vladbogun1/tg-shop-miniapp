"use client";

import { Package, UserRound } from "lucide-react";
import Link from "next/link";
import type { AdminReview } from "../model/types";

/** Who · product · order of a review. */
export function ReviewMeta({ review: r, onOpenOrder }: { review: AdminReview; onOpenOrder: (orderId: string) => void }) {
  const author = r.author?.trim() || "Покупатель";
  const customer = r.customerName?.trim();

  return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--text-muted)]">
        <span className="inline-flex min-w-0 items-center gap-1.5" title="Подпись на сайте · имя покупателя">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <span className="truncate">
            <b className="font-semibold text-[var(--text)]">{author}</b>
            {customer && customer !== author ? <span> · {customer}</span> : null}
          </span>
        </span>
        <Link
          href={`/products?edit=${r.productId}`}
          className="focusable inline-flex min-w-0 items-center gap-1.5 rounded-[var(--r-sm)] hover:text-[var(--accent-hi)] hover:underline"
          title="Открыть товар"
        >
          <Package className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <span className="truncate">
            {r.productTitle || "Товар"}
            {r.variantName ? <span className="text-[var(--text-faint)]"> · {r.variantName}</span> : null}
          </span>
        </Link>
        {r.orderId && (
          <button
            type="button"
            onClick={() => onOpenOrder(r.orderId!)}
            className="focusable font-display tabular inline-flex h-[22px] items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] px-1.5 text-[12px] font-semibold tracking-[0.02em] text-[var(--text)] hover:border-[var(--line-strong)]"
            title="Открыть заказ"
          >
            #{r.orderShortId || r.orderId.slice(0, 8)}
          </button>
        )}
      </div>
  );
}
