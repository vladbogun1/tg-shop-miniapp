import type { AdminDispatchOrder } from "@/features/order";
import { money } from "@shop/core/money";
import { formatDateTime } from "@shop/core/time";
import { AlertTriangle } from "lucide-react";
import { onlineDue } from "../model/dispatch";

/** NEW order still waiting for its online payment: do not ship yet. */
export function AwaitingPaymentNote({ o }: { o: AdminDispatchOrder }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2.5 text-[13px] font-medium text-[var(--text)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
      {o.prepaymentMinor > 0 ? "Ждём онлайн-предоплату" : "Ждём онлайн-оплату"} {money(onlineDue(o), o.currency)} — не
      отправляйте, пока она не придёт.
    </div>
  );
}

/** APPROVED but the online payment never arrived: shipping needs a confirmation. */
export function UnpaidNote({ o, expired }: { o: AdminDispatchOrder; expired: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2.5 text-[13px] text-[var(--text)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
      <span className="min-w-0">
        <b className="font-semibold text-[var(--danger-ink)]">
          {o.prepaymentMinor > 0 ? "Предоплата не пришла" : "Онлайн-оплата не пришла"}
        </b>
        {": "}
        <b className="tabular font-semibold">{money(onlineDue(o), o.currency)}</b>
        {expired && o.paymentDueAt && <> · срок оплаты прошёл {formatDateTime(o.paymentDueAt)}</>}
        <span className="block text-[12px] text-[var(--text-muted)]">
          Заказ одобрен без оплаты. Отправить можно — с подтверждением (например, если договорились в чате).
        </span>
      </span>
    </div>
  );
}
