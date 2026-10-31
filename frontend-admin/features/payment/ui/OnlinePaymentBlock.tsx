"use client";

/**
 * «Онлайн-оплата» section of the order card (monobank acquiring).
 *  - While unpaid: the deadline «Оплатить до …» (24 h after the order; past it the backend
 *    cancels the order with PAYMENT_TIMEOUT) with the time left, or «просрочено».
 *  - The order's invoices, newest first: status chip, amount, card + method, fee, RRN, time,
 *    failure reason, refunds («возврат в обработке» until monobank confirms).
 *  - «Обновить статус» polls monobank; «Вернуть деньги» on a paid invoice with money left.
 *  - «Чеки» once an invoice was paid: fiscal checks of the sale / refunds (Вчасно.Каса) and the
 *    bank receipt — «Скачать PDF» (signed link, ~10 min) and the DPS link to copy or open, so the
 *    receipt can be handed to the customer. Re-read every 20 s while a check is being issued.
 *
 * A successful payment does NOT approve the order — the admin still confirms it; if the goods are
 * missing, the money goes back from here.
 */
import { forwardRef, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { nowMs } from "@shop/core/time";
import { isAwaitingPayment, refundableMinor } from "../model/online-payment";
import type { AdminInvoice, PaymentOrder } from "../model/types";
import { useOrderInvoicesQuery, useRefreshInvoices, useRefundInvoice } from "../queries";
import { Button } from "@shop/ui/admin-button";
import { DeadlineNotice } from "./DeadlineNotice";
import { InvoiceList } from "./InvoiceList";
import { Receipts } from "./Receipts";
import { RefundModal } from "./RefundModal";

/** Re-render once a minute so «осталось …» stays honest while the card is open. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => nowMs());
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowMs()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const OnlinePaymentBlock = forwardRef<HTMLElement, { order: PaymentOrder; onChanged?: () => void }>(
  function OnlinePaymentBlock({ order, onChanged }, ref) {
    const now = useNow();
    const [refundFor, setRefundFor] = useState<AdminInvoice | null>(null);

    const q = useOrderInvoicesQuery(order.id, { pollRefunds: true });
    const refreshMut = useRefreshInvoices(order.id, onChanged);
    const refundMut = useRefundInvoice(order.id, () => {
      setRefundFor(null);
      onChanged?.();
    });
    const invoices = q.data ?? [];

    const cur = order.currency;
    const awaiting = isAwaitingPayment(order);

    // Orders placed before online payment (no deadline, no invoices) have nothing to show.
    if (!awaiting && !order.paymentDueAt && q.isSuccess && invoices.length === 0) return null;

    async function refund(amountMinor: number | undefined): Promise<boolean> {
      if (!refundFor) return false;
      try {
        await refundMut.mutateAsync({ invoiceId: refundFor.invoiceId, amountMinor });
        return true;
      } catch {
        return false; // тост ошибки уже показан
      }
    }

    return (
      <section ref={ref} className="card scroll-mt-4 p-4" aria-label="Онлайн-оплата">
        <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
          <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Онлайн-оплата · monobank</h3>
          <Button
            size="sm"
            variant="ghost"
            loading={refreshMut.isPending}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => refreshMut.mutate()}
          >
            Обновить статус
          </Button>
        </div>

        {awaiting && <DeadlineNotice order={order} now={now} />}

        <InvoiceList q={q} currency={cur} onRefund={setRefundFor} />

        {invoices.some((i) => i.appliedAt) && <Receipts orderId={order.id} currency={cur} />}

        <RefundModal
          open={!!refundFor}
          invoice={refundFor}
          leftMinor={refundFor ? refundableMinor(refundFor) : 0}
          currency={cur}
          loading={refundMut.isPending}
          onClose={() => setRefundFor(null)}
          onConfirm={refund}
        />
      </section>
    );
  }
);

