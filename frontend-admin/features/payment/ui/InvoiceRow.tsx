"use client";

import type { ReactNode } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { CopyButton } from "@/components/ui/CopyButton";
import { invoiceStatusLabel, invoiceStatusTone, isOverdue, maskedPanShort, paymentMethodLabel, refundableMinor } from "../model/online-payment";
import type { AdminInvoice } from "../model/types";

export function InvoiceRow({ inv, currency, onRefund }: { inv: AdminInvoice; currency: string; onRefund: () => void }) {
  const canRefund = refundableMinor(inv) > 0 && !inv.refundPending;
  const linkLive = inv.status === "created" && !!inv.pageUrl && !isOverdue(inv.expiresAt);

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

      <InvoiceFacts inv={inv} currency={currency} />

      {inv.failureReason && (
        <p className="text-[12.5px] font-medium text-[var(--danger-ink)]">
          {inv.failureReason}
          {inv.errCode ? ` (код ${inv.errCode})` : ""}
        </p>
      )}

      <RefundNote inv={inv} currency={currency} />

      {linkLive && (
        <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--text-muted)]">
          <span className="min-w-0 truncate">
            Ссылка на оплату{inv.expiresAt ? ` до ${formatDateTime(inv.expiresAt)}` : ""}
          </span>
          <CopyButton value={inv.pageUrl} label="Скопировать ссылку на оплату" className="ml-auto" />
        </div>
      )}

      {canRefund && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
          <Button size="sm" variant="surface" icon={<Undo2 className="h-4 w-4" />} onClick={onRefund}>
            Вернуть только деньги
          </Button>
          {/* Two ways to give money back confused admins: this one never touches the goods. */}
          <span className="text-[11.5px] text-[var(--text-faint)]">
            Товар и склад не трогает — для возврата товара есть «Возврат».
          </span>
        </div>
      )}
    </li>
  );
}

/** Карта · способ · комиссия · RRN — через точку, только то, что есть. */
function InvoiceFacts({ inv, currency }: { inv: AdminInvoice; currency: string }) {
  const card = maskedPanShort(inv.maskedPan);
  const method = paymentMethodLabel(inv.paymentMethod);

  const facts: ReactNode[] = [];
  if (card) facts.push(<span className="tabular">{card}</span>);
  if (method) facts.push(method);
  if (inv.feeMinor != null && inv.feeMinor > 0) facts.push(<>комиссия {money(inv.feeMinor, currency)}</>);
  if (inv.rrn) facts.push(<>RRN <span className="tabular">{inv.rrn}</span></>);
  if (facts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-2 text-[12.5px] text-[var(--text-muted)]">
      {facts.map((f, i) => (
        <span key={i}>
          {i > 0 && <span className="mr-2 text-[var(--text-faint)]">·</span>}
          {f}
        </span>
      ))}
    </div>
  );
}

/** «Возвращено N» и пометка «возврат в обработке», пока monobank не подтвердил. */
function RefundNote({ inv, currency }: { inv: AdminInvoice; currency: string }) {
  if (inv.refundedMinor <= 0 && !inv.refundPending) return null;
  return (
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
  );
}
