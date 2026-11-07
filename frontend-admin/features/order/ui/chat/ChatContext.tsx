"use client";

import { ChevronRight } from "lucide-react";
import { money } from "@/lib/money";
import { STATUS_LABEL } from "../../model/status";
import type { AdminOrderDetail } from "../../api";

/**
 * Тонкая строка контекста над перепиской: «Отправлен · ТТН 2045… · 1 240 ₴» — чтобы ответить на «где посылка»,
 * не возвращаясь в «Детали». Тап открывает «Детали». На двухколоночном ПК не нужна (детали рядом).
 */
export function ChatContext({ order, onOpenDetails }: { order: AdminOrderDetail | undefined; onOpenDetails: () => void }) {
  if (!order) return null;
  return (
    <button
      type="button"
      onClick={onOpenDetails}
      className="card-2 nb-press tabular mb-2 flex min-h-9 w-full shrink-0 items-center gap-2 px-3 text-left text-[12.5px] text-[var(--text-muted)] pointer-coarse:min-h-11"
      aria-label="Открыть детали заказа"
    >
      <span className="min-w-0 truncate">
        <b className="font-semibold text-[var(--text)]">{STATUS_LABEL[order.status]}</b>
        {order.trackingNumber && <> · ТТН {order.trackingNumber}</>}
        {" · "}
        {money(order.totalMinor, order.currency)}
      </span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0" />
    </button>
  );
}
