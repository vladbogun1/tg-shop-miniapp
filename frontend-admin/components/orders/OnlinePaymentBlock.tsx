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
import { forwardRef, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Clock, Download, ExternalLink, Loader2, ReceiptText, RefreshCw, Undo2 } from "lucide-react";
import { receiptsPollMs, type ReceiptKind, type ReceiptStatus } from "@shop/shared";
import { adminApi, ApiError, receiptHref, type AdminInvoice, type Receipt } from "@/lib/api";
import type { AdminOrderDetail } from "@/lib/orders-api";
import { money } from "@/lib/money";
import { formatDateTime } from "@/lib/orders";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import {
  invoiceStatusLabel,
  invoiceStatusTone,
  isOverdue,
  maskedPanShort,
  paymentMethodLabel,
  refundableMinor,
  timeLeft,
} from "@/lib/online-payment";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CopyButton } from "./CopyButton";
import { RefundModal } from "./RefundModal";

export const orderPaymentsKey = (orderId: string) => ["order-payments", orderId] as const;
export const orderReceiptsKey = (orderId: string) => ["order-receipts", orderId] as const;

/** Re-render once a minute so «осталось …» stays honest while the card is open. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const OnlinePaymentBlock = forwardRef<HTMLElement, { order: AdminOrderDetail; onChanged?: () => void }>(
  function OnlinePaymentBlock({ order, onChanged }, ref) {
    const qc = useQueryClient();
    const { push } = useToast();
    const now = useNow();
    const [refreshing, setRefreshing] = useState(false);
    const [refundFor, setRefundFor] = useState<AdminInvoice | null>(null);
    const [refunding, setRefunding] = useState(false);

    const key = orderPaymentsKey(order.id);
    const q = useQuery({
      queryKey: key,
      queryFn: () => adminApi.getOrderPayments(order.id),
      // While a refund is being settled the backend polls monobank; pick its result up.
      refetchInterval: (query) => ((query.state.data ?? []).some((i) => i.refundPending) ? 15_000 : false),
    });
    const invoices = q.data ?? [];

    const cur = order.currency;
    const awaiting =
      !order.paid && !!order.paymentDueAt && (order.status === "NEW" || order.status === "APPROVED");
    const overdue = awaiting && isOverdue(order.paymentDueAt, now);
    const left = awaiting && !overdue ? timeLeft(order.paymentDueAt as string, now) : null;

    // Orders placed before online payment (no deadline, no invoices) have nothing to show.
    if (!awaiting && !order.paymentDueAt && q.isSuccess && invoices.length === 0) return null;

    async function refresh() {
      setRefreshing(true);
      try {
        const fresh = await adminApi.refreshOrderPayments(order.id);
        qc.setQueryData(key, fresh);
        push("Статус оплаты обновлён", "ok");
        onChanged?.();
      } catch (e) {
        push(e instanceof ApiError ? e.message : "Не удалось обновить статус", "error");
      } finally {
        setRefreshing(false);
      }
    }

    async function refund(amountMinor: number | undefined): Promise<boolean> {
      if (!refundFor) return false;
      setRefunding(true);
      try {
        const fresh = await adminApi.refundOrderPayment(order.id, refundFor.invoiceId, amountMinor);
        qc.setQueryData(key, fresh);
        push("Возврат отправлен в monobank — деньги придут на карту покупателя", "ok");
        setRefundFor(null);
        onChanged?.();
        return true;
      } catch (e) {
        push(e instanceof ApiError ? e.message : "Не удалось оформить возврат", "error");
        return false;
      } finally {
        setRefunding(false);
      }
    }

    return (
      <section ref={ref} className="card scroll-mt-4 p-4" aria-label="Онлайн-оплата">
        <div className="mb-3 flex min-h-7 items-center justify-between gap-2">
          <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Онлайн-оплата · monobank</h3>
          <Button
            size="sm"
            variant="ghost"
            loading={refreshing}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={refresh}
          >
            Обновить статус
          </Button>
        </div>

        {awaiting && (
          <div
            className={cn(
              "mb-3 flex items-start gap-2 rounded-[var(--r-md)] border px-3 py-2.5 text-[13px]",
              overdue
                ? "border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[var(--danger-ink)]"
                : "border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[var(--text)]"
            )}
          >
            <Clock className={cn("mt-0.5 h-4 w-4 shrink-0", !overdue && "text-[var(--warn)]")} />
            <span className="min-w-0">
              <b className="font-semibold">Оплатить до {formatDateTime(order.paymentDueAt as string)}</b>
              {overdue ? (
                // Only NEW orders are auto-cancelled (OrderService.expireUnpaid); an approved one stays.
                order.status === "NEW" ? (
                  <> · просрочено — заказ отменится автоматически</>
                ) : (
                  <> · просрочено — заказ одобрен, сам не отменится</>
                )
              ) : (
                left && <> · осталось {left}</>
              )}
              {order.amountDueMinor > 0 && (
                <span className="block text-[12px] text-[var(--text-muted)]">
                  К оплате онлайн: <b className="tabular font-semibold text-[var(--text)]">{money(order.amountDueMinor, cur)}</b>
                  {order.prepaymentMinor > 0 && order.amountDueMinor < order.totalMinor && <> (предоплата, остаток — наложкой)</>}
                </span>
              )}
            </span>
          </div>
        )}

        {q.isLoading ? (
          <Skeleton className="h-16 rounded-[var(--r-md)]" />
        ) : q.isError ? (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--danger-ink)]">
            <CircleAlert className="h-4 w-4 shrink-0" />
            {q.error instanceof ApiError ? q.error.message : "Платежи не загрузились."}
            <button type="button" className="font-semibold underline" onClick={() => q.refetch()}>
              Повторить
            </button>
          </p>
        ) : invoices.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">
            Покупатель ещё не открывал страницу оплаты.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.invoiceId} inv={inv} currency={cur} onRefund={() => setRefundFor(inv)} />
            ))}
          </ul>
        )}

        {invoices.some((i) => i.appliedAt) && <Receipts orderId={order.id} currency={cur} />}

        <RefundModal
          open={!!refundFor}
          invoice={refundFor}
          leftMinor={refundFor ? refundableMinor(refundFor) : 0}
          currency={cur}
          loading={refunding}
          onClose={() => setRefundFor(null)}
          onConfirm={refund}
        />
      </section>
    );
  }
);

function InvoiceRow({ inv, currency, onRefund }: { inv: AdminInvoice; currency: string; onRefund: () => void }) {
  const card = maskedPanShort(inv.maskedPan);
  const method = paymentMethodLabel(inv.paymentMethod);
  const left = refundableMinor(inv);
  const canRefund = left > 0 && !inv.refundPending;
  const linkLive = inv.status === "created" && !!inv.pageUrl && !isOverdue(inv.expiresAt);

  const facts: React.ReactNode[] = [];
  if (card) facts.push(<span className="tabular">{card}</span>);
  if (method) facts.push(method);
  if (inv.feeMinor != null && inv.feeMinor > 0) facts.push(<>комиссия {money(inv.feeMinor, currency)}</>);
  if (inv.rrn) facts.push(<>RRN <span className="tabular">{inv.rrn}</span></>);

  return (
    <li className="card-2 flex flex-col gap-1.5 rounded-[var(--r-md)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={invoiceStatusTone(inv.status)}>{invoiceStatusLabel(inv.status)}</Badge>
        <span className="font-display tabular text-[15px] font-bold text-[var(--ink)]">
          {money(inv.amountMinor, currency)}
        </span>
        <span className="tabular ml-auto text-[11px] text-[var(--text-faint)]">
          {formatDateTime(inv.appliedAt ?? inv.updatedAt ?? inv.createdAt)}
        </span>
      </div>

      {facts.length > 0 && (
        <div className="flex flex-wrap gap-x-2 text-[12.5px] text-[var(--text-muted)]">
          {facts.map((f, i) => (
            <span key={i}>
              {i > 0 && <span className="mr-2 text-[var(--text-faint)]">·</span>}
              {f}
            </span>
          ))}
        </div>
      )}

      {inv.failureReason && (
        <p className="text-[12.5px] font-medium text-[var(--danger-ink)]">
          {inv.failureReason}
          {inv.errCode ? ` (код ${inv.errCode})` : ""}
        </p>
      )}

      {(inv.refundedMinor > 0 || inv.refundPending) && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          {inv.refundedMinor > 0 && (
            <span>
              Возвращено <b className="tabular font-semibold text-[var(--text)]">{money(inv.refundedMinor, currency)}</b>
            </span>
          )}
          {inv.refundPending && (
            <Badge tone="warn">
              <Loader2 className="h-3 w-3 animate-spin" />
              возврат в обработке
            </Badge>
          )}
        </div>
      )}

      {linkLive && (
        <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <span className="min-w-0 truncate">
            Ссылка на оплату{inv.expiresAt ? ` до ${formatDateTime(inv.expiresAt)}` : ""}
          </span>
          <CopyButton value={inv.pageUrl} label="Скопировать ссылку на оплату" className="ml-auto" />
        </div>
      )}

      {canRefund && (
        <div className="pt-1">
          <Button size="sm" variant="surface" icon={<Undo2 className="h-4 w-4" />} onClick={onRefund}>
            Вернуть деньги
          </Button>
        </div>
      )}
    </li>
  );
}

const RECEIPT_KIND: Record<ReceiptKind, string> = {
  FISCAL_SALE: "Фискальный чек продажи",
  FISCAL_RETURN: "Чек возврата",
  BANK: "Квитанция банка",
};

const RECEIPT_STATUS: Record<ReceiptStatus, { label: string; tone: "warn" | "ok" | "danger" }> = {
  PENDING: { label: "готовится…", tone: "warn" },
  READY: { label: "готов", tone: "ok" },
  FAILED: { label: "ошибка", tone: "danger" },
};

/** Fiscal checks + bank receipts of the paid invoices (the bot also sends them to the customer). */
function Receipts({ orderId, currency }: { orderId: string; currency: string }) {
  const since = useRef(Date.now());
  const q = useQuery({
    queryKey: orderReceiptsKey(orderId),
    queryFn: () => adminApi.getOrderReceipts(orderId),
    staleTime: 30_000,
    refetchInterval: (query) => receiptsPollMs(query.state.data, since.current),
  });
  const list = q.data ?? [];
  if (q.isLoading) return <Skeleton className="mt-3 h-12 rounded-[var(--r-md)]" />;
  if (list.length === 0) return null;
  return (
    <div className="mt-4 border-t border-[var(--line)] pt-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-muted)]">
        <ReceiptText className="h-3.5 w-3.5" /> Чеки
      </h4>
      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <ReceiptRow key={r.key} r={r} currency={currency} />
        ))}
      </ul>
    </div>
  );
}

function ReceiptRow({ r, currency }: { r: Receipt; currency: string }) {
  const st = RECEIPT_STATUS[r.status];
  const href = receiptHref(r.downloadUrl);
  return (
    <li className="card-2 flex flex-col gap-1.5 rounded-[var(--r-md)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[13px] font-semibold text-[var(--ink)]">{RECEIPT_KIND[r.kind]}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
        {r.amountMinor != null && (
          <span className="tabular text-[12.5px] text-[var(--text-muted)]">{money(r.amountMinor, currency)}</span>
        )}
        {r.createdAt && (
          <span className="tabular ml-auto text-[11px] text-[var(--text-faint)]">{formatDateTime(r.createdAt)}</span>
        )}
      </div>
      {r.status === "FAILED" && r.statusText && (
        <p className="text-[12.5px] font-medium text-[var(--danger-ink)]">{r.statusText}</p>
      )}
      {(href || r.taxUrl) && (
        <div className="flex flex-wrap items-center gap-2">
          {href && (
            <a
              href={href}
              download
              className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--line)] px-2.5 text-[12.5px] font-semibold text-[var(--text)] hover:border-[var(--line-strong)]"
            >
              <Download className="h-3.5 w-3.5" /> Скачать PDF
            </a>
          )}
          {r.taxUrl && (
            <>
              <a
                href={r.taxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 items-center gap-1.5 px-1 text-[12.5px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Чек на сайте ДПС
              </a>
              <CopyButton value={r.taxUrl} label="Скопировать ссылку на чек в ДПС" />
            </>
          )}
        </div>
      )}
    </li>
  );
}
