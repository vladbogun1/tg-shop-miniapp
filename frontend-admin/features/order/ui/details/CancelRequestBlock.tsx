"use client";

/**
 * «Запрос отмены» — the customer asks to cancel a PAID order (phase A, docs/ORDERS-SUPPORT-REVIEWS.md).
 *  - PENDING: the reason and when it came, «Одобрить и вернуть деньги» / «Отклонить».
 *    Approve (confirm modal: the amount that goes back to the card, the goods return to stock)
 *    rejects the order (CHANGED_MIND) and refunds every paid monobank invoice in full.
 *    Decline needs a comment — the customer sees it (bot DM + order page); no second request.
 *  - APPROVED / DECLINED: a one-line record of the decision.
 */
import { useState } from "react";
import { Ban, CheckCircle2, Clock, Undo2, XCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { paymentKeys, refundableMinor } from "@/features/payment";
import { toast } from "@shop/ui/toast";
import { useForm } from "@shop/ui/form";
import { Button } from "@shop/ui/admin-button";
import { ApproveCancelModal, DeclineCancelModal } from "./CancelRequestModals";
import type { AdminOrderDetail, CancelApproveResult } from "../../api";
import { useApproveCancelMutation, useCancelRequestInvoicesQuery, useDeclineCancelMutation } from "../../queries/details";

/** Тост по итогу одобрения: что отправлено на возврат и что вернуть руками. */
function announceApproval(r: CancelApproveResult, cur: string) {
  if (r.refundErrors.length > 0) {
    toast.error(`Заказ отменён, но monobank отклонил возврат: ${r.refundErrors.join("; ")}. Верните вручную.`);
  } else if (r.manualRefundMinor > 0) {
    toast.info(`Заказ отменён. Онлайн-возврат отправлен; ${money(r.manualRefundMinor, cur)} верните вручную.`);
  } else {
    toast.success(
      r.refundRequestedMinor > 0 ? `Заказ отменён, ${money(r.refundRequestedMinor, cur)} отправлено на возврат` : "Заказ отменён",
    );
  }
}

/** APPROVED / DECLINED: a one-line record of the decision. */
function ResolvedNote({ order }: { order: AdminOrderDetail }) {
  const approved = order.cancelRequestStatus === "APPROVED";
  return (
    <section className="card flex items-start gap-2.5 p-4 text-[13px]">
      {approved ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ok)]" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
      )}
      <div className="min-w-0">
        <p className="font-semibold text-[var(--text)]">
          Запрос отмены {approved ? "одобрен" : "отклонён"}
          {order.cancelRequestResolvedAt && (
            <span className="font-normal text-[var(--text-faint)]"> · {formatDateTime(order.cancelRequestResolvedAt)}</span>
          )}
        </p>
        {order.cancelRequestReason && <p className="mt-0.5 text-[var(--text-muted)]">Причина покупателя: {order.cancelRequestReason}</p>}
        {order.cancelRequestAdminComment && <p className="mt-0.5 text-[var(--text-muted)]">Ответ: {order.cancelRequestAdminComment}</p>}
      </div>
    </section>
  );
}

function PendingCard({
  order,
  received,
  onApprove,
  onDecline,
}: {
  order: AdminOrderDetail;
  received: number;
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <section className="card border-[color-mix(in_srgb,var(--warn)_50%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Ban className="h-4 w-4 text-[var(--warn)]" />
        <h3 className="section-title !text-[12px] !text-[var(--warn)]">Запрос отмены</h3>
        {order.cancelRequestedAt && (
          <span className="ml-auto flex items-center gap-1 text-[12px] text-[var(--text-faint)]">
            <Clock className="h-3.5 w-3.5" />
            {formatDateTime(order.cancelRequestedAt)}
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--text)]">
        {order.cancelRequestReason || "—"}
      </p>
      <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
        Заказ оплачен ({money(received, order.currency)}). Одобрение отменит заказ, вернёт товар на склад и деньги на карту покупателя через
        monobank. Отказ — покупатель увидит ваш комментарий, повторно запросить не сможет.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button variant="danger" icon={<Undo2 className="h-4 w-4" />} onClick={onApprove} className="sm:flex-1">
          Одобрить и вернуть деньги
        </Button>
        <Button variant="surface" icon={<XCircle className="h-4 w-4" />} onClick={onDecline} className="sm:flex-1">
          Отклонить
        </Button>
      </div>
    </section>
  );
}

export function CancelRequestBlock({ order, onChanged }: { order: AdminOrderDetail; onChanged?: () => void }) {
  const status = order.cancelRequestStatus;
  const qc = useQueryClient();
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const form = useForm<{ comment: string }>({ defaultValues: { comment: "" } });
  const comment = form.watch("comment");

  const pending = status === "PENDING";
  // Same query (and cache) as the «Онлайн-оплата» block below.
  const invoicesQ = useCancelRequestInvoicesQuery(order.id, pending);

  function done() {
    void qc.invalidateQueries({ queryKey: paymentKeys.invoices(order.id) });
    onChanged?.();
  }
  const approveM = useApproveCancelMutation(order, (r) => announceApproval(r, order.currency), {
    onClose: () => setApproveOpen(false),
    onDone: done,
  });
  const declineM = useDeclineCancelMutation(order, {
    onClose: () => {
      setDeclineOpen(false);
      form.reset({ comment: "" });
    },
    onDone: done,
  });
  const busy = approveM.isPending || declineM.isPending;

  if (!status) return null;
  if (!pending) return <ResolvedNote order={order} />;

  const invoices = invoicesQ.data ?? [];
  const refundable = invoices.reduce((sum, inv) => sum + refundableMinor(inv), 0);
  const received = Math.min(order.receivedMinor, order.totalMinor);
  // Recorded by hand (not through monobank): has to go back by hand as well.
  const onlinePaid = invoices.filter((i) => i.appliedAt).reduce((s, i) => s + i.amountMinor, 0);
  const manual = Math.max(0, received - onlinePaid);

  return (
    <>
      <PendingCard order={order} received={received} onApprove={() => setApproveOpen(true)} onDecline={() => setDeclineOpen(true)} />
      <ApproveCancelModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={() => approveM.mutate()}
        busy={busy}
        loading={invoicesQ.isLoading}
        refundable={refundable}
        manual={manual}
        currency={order.currency}
      />
      <DeclineCancelModal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        onConfirm={(c) => declineM.mutate(c)}
        busy={busy}
        comment={comment}
        register={form.register}
      />
    </>
  );
}
