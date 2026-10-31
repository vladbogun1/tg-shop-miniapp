"use client";

import { TriangleAlert } from "lucide-react";
import type { GiftLimit } from "@/features/gift";
import { money } from "@/lib/money";

/**
 * Gifts over the monthly limit are taxed (18 % ПДФО + 5 % military levy on the excess) — red when the
 * customer is already over it or this gift takes them over, a quiet line otherwise.
 */
export function GiftLimitNote({ limit, addMinor }: { limit: GiftLimit; addMinor: number }) {
  if (limit.limitMinor <= 0) return null;
  const after = limit.usedMinor + addMinor;
  if (after <= limit.limitMinor) {
    return (
      <p className="mb-3 text-[12px] text-[var(--text-faint)]">
        Подарков этому покупателю в этом месяце: {money(limit.usedMinor)} из {money(limit.limitMinor)}
        {addMinor > 0 && <> → с этим {money(after)}</>}.
      </p>
    );
  }
  const already = limit.usedMinor >= limit.limitMinor;
  return (
    <div
      role="alert"
      className="mb-3 flex gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3.5 py-3 text-[13px] leading-snug text-[var(--danger-ink)]"
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
      <div>
        <div className="font-semibold">
          {already
            ? "Внимание: этому покупателю в этом месяце уже выдано подарков сверх лимита"
            : "Внимание: этот подарок выведет покупателя за месячный лимит"}
        </div>
        <div className="mt-1">
          Уже выдано {money(limit.usedMinor)} при лимите {money(limit.limitMinor)}
          {addMinor > 0 && <>, с этим подарком — {money(after)} (превышение {money(after - limit.limitMinor)})</>}.
          С суммы сверх лимита нужно платить НДФЛ и военный сбор. Лучше дать скидку или отложить на следующий месяц.
        </div>
      </div>
    </div>
  );
}
