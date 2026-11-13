"use client";

import type { AdminDispatchOrder } from "@/features/order";
import { money } from "@shop/core/money";
import { formatDateTime } from "@shop/core/time";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { onlineDue } from "../model/dispatch";

/** NEW order still waiting for its online payment: do not ship yet. */
export function AwaitingPaymentNote({ o }: { o: AdminDispatchOrder }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[13px] font-medium text-[var(--text)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      {o.prepaymentMinor > 0 ? "Ждём онлайн-предоплату" : "Ждём онлайн-оплату"} {money(onlineDue(o), o.currency)} — не
      отправляйте, пока она не придёт.
    </div>
  );
}

/**
 * APPROVED but the online payment never arrived: shipping needs a confirmation. One short red line;
 * the explanation opens under «Подробнее» (the card carries a red stripe on the left as well).
 */
export function UnpaidNote({ o, expired }: { o: AdminDispatchOrder; expired: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-[13px] text-[var(--text)]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
        <span className="min-w-0 flex-1">
          <b className="font-semibold text-[var(--danger-ink)]">{o.prepaymentMinor > 0 ? "Предоплата не пришла" : "Онлайн-оплата не пришла"}</b>
          {": "}
          <b className="tabular font-semibold">{money(onlineDue(o), o.currency)}</b>
          {expired && o.paymentDueAt && <> · срок оплаты прошёл {formatDateTime(o.paymentDueAt)}</>}
        </span>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="focusable -my-1 inline-flex h-8 shrink-0 items-center gap-0.5 rounded-[var(--r-sm)] px-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] pointer-coarse:h-11"
        >
          Подробнее
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", more && "rotate-180")} />
        </button>
      </div>
      {more && (
        <p className="mt-1.5 pl-6 text-[12px] leading-snug text-[var(--text-muted)]">
          Заказ одобрен без оплаты. ТТН создастся при «Упаковано», когда оплата придёт (или отметьте оплату вручную в заказе).
        </p>
      )}
    </div>
  );
}
