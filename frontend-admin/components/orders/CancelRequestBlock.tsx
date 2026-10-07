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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Ban, CheckCircle2, Clock, Undo2, XCircle } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api";
import { ordersApi, type AdminOrderDetail } from "@/lib/orders-api";
import { money } from "@/lib/money";
import { formatDateTime } from "@/lib/orders";
import { refundableMinor } from "@/lib/online-payment";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { orderPaymentsKey } from "./OnlinePaymentBlock";

export function CancelRequestBlock({ order, onChanged }: { order: AdminOrderDetail; onChanged?: () => void }) {
  const status = order.cancelRequestStatus;
  const qc = useQueryClient();
  const { push } = useToast();
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = status === "PENDING";
  // Same query (and cache) as the «Онлайн-оплата» block below.
  const invoicesQ = useQuery({
    queryKey: orderPaymentsKey(order.id),
    queryFn: () => adminApi.getOrderPayments(order.id),
    enabled: pending,
  });

  if (!status) return null;

  const cur = order.currency;
  const refundable = (invoicesQ.data ?? []).reduce((sum, inv) => sum + refundableMinor(inv), 0);
  const received = Math.min(order.receivedMinor, order.totalMinor);
  // Recorded by hand (not through monobank): has to go back by hand as well.
  const onlinePaid = (invoicesQ.data ?? []).filter((i) => i.appliedAt).reduce((s, i) => s + i.amountMinor, 0);
  const manual = Math.max(0, received - onlinePaid);

  function done() {
    void qc.invalidateQueries({ queryKey: orderPaymentsKey(order.id) });
    onChanged?.();
  }

  async function approve() {
    setBusy(true);
    try {
      const r = await ordersApi.approveCancelRequest(order.id);
      setApproveOpen(false);
      if (r.refundErrors.length > 0) {
        push(`Заказ отменён, но monobank отклонил возврат: ${r.refundErrors.join("; ")}. Верните вручную.`, "error");
      } else if (r.manualRefundMinor > 0) {
        push(`Заказ отменён. Онлайн-возврат отправлен; ${money(r.manualRefundMinor, cur)} верните вручную.`, "info");
      } else {
        push(
          r.refundRequestedMinor > 0
            ? `Заказ отменён, ${money(r.refundRequestedMinor, cur)} отправлено на возврат`
            : "Заказ отменён",
          "ok"
        );
      }
      done();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось одобрить запрос", "error");
      if (e instanceof ApiError && e.code) done();
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await ordersApi.declineCancelRequest(order.id, comment.trim());
      setDeclineOpen(false);
      setComment("");
      push("Запрос отклонён, покупатель получил ваш комментарий", "ok");
      done();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось отклонить запрос", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!pending) {
    const approved = status === "APPROVED";
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
          {order.cancelRequestReason && (
            <p className="mt-0.5 text-[var(--text-muted)]">Причина покупателя: {order.cancelRequestReason}</p>
          )}
          {order.cancelRequestAdminComment && (
            <p className="mt-0.5 text-[var(--text-muted)]">Ответ: {order.cancelRequestAdminComment}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
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
          Заказ оплачен ({money(received, cur)}). Одобрение отменит заказ, вернёт товар на склад и деньги на карту
          покупателя через monobank. Отказ — покупатель увидит ваш комментарий, повторно запросить не сможет.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button variant="danger" icon={<Undo2 className="h-4 w-4" />} onClick={() => setApproveOpen(true)} className="sm:flex-1">
            Одобрить и вернуть деньги
          </Button>
          <Button variant="surface" icon={<XCircle className="h-4 w-4" />} onClick={() => setDeclineOpen(true)} className="sm:flex-1">
            Отклонить
          </Button>
        </div>
      </section>

      <Modal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        title="Одобрить отмену"
        footer={
          <>
            <ModalCancel />
            <Button variant="danger" loading={busy} onClick={() => void approve()}>
              {refundable > 0 ? `Отменить и вернуть ${money(refundable, cur)}` : "Отменить заказ"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2.5 text-[13.5px] text-[var(--text)]">
          <p>
            Заказ будет <b>отменён</b> (причина «Передумал / отменил»), товары <b>вернутся на склад</b>.
          </p>
          {invoicesQ.isLoading ? (
            <p className="text-[var(--text-muted)]">Считаем сумму возврата…</p>
          ) : refundable > 0 ? (
            <p>
              На карту покупателя через monobank вернётся{" "}
              <b className="tabular text-[var(--accent-hi)]">{money(refundable, cur)}</b>.
            </p>
          ) : (
            <p className="text-[var(--text-muted)]">Онлайн-платежей для возврата нет.</p>
          )}
          {manual > 0 && (
            <p className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
              {money(manual, cur)} получено не через monobank — их нужно вернуть вручную.
            </p>
          )}
          <p className="text-[12px] text-[var(--text-faint)]">
            Возврат нельзя отменить. Покупатель получит сообщение в Telegram.
          </p>
        </div>
      </Modal>

      <Modal
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        closeOnBackdrop={false}
        dirty={comment.trim() !== ""}
        title="Отклонить запрос отмены"
        footer={
          <>
            <ModalCancel />
            <Button variant="accent" loading={busy} disabled={!comment.trim()} onClick={() => void decline()}>
              Отклонить
            </Button>
          </>
        }
      >
        <Textarea
          label="Комментарий для покупателя (обязательно)"
          rows={4}
          maxLength={1000}
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: посылка уже передана в Новую Почту — после получения можно оформить возврат."
        />
        <p className="mt-2 text-[12px] text-[var(--text-faint)]">
          Покупатель увидит его в боте и на странице заказа. Повторно запросить отмену он не сможет — только
          написать в чат.
        </p>
      </Modal>
    </>
  );
}
