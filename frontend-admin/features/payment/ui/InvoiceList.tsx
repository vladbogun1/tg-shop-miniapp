"use client";

import { CircleAlert } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "@shop/core/errors";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AdminInvoice } from "../model/types";
import { InvoiceRow } from "./InvoiceRow";

/** Счета заказа, новые сверху: загрузка / ошибка с повтором / «ещё не открывал» / список. */
export function InvoiceList({
  q,
  currency,
  onRefund,
}: {
  q: UseQueryResult<AdminInvoice[]>;
  currency: string;
  onRefund: (inv: AdminInvoice) => void;
}) {
  const invoices = q.data ?? [];
  if (q.isLoading) return <Skeleton className="h-16 rounded-[var(--r-md)]" />;
  if (q.isError) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--danger-ink)]">
        <CircleAlert className="h-4 w-4 shrink-0" />
        {q.error instanceof ApiError ? q.error.message : "Платежи не загрузились."}
        <button type="button" className="font-semibold underline" onClick={() => q.refetch()}>
          Повторить
        </button>
      </p>
    );
  }
  if (invoices.length === 0) {
    return <p className="text-[13px] text-[var(--text-muted)]">Покупатель ещё не открывал страницу оплаты.</p>;
  }
  return (
    <ul className="flex flex-col gap-2.5">
      {invoices.map((inv) => (
        <InvoiceRow key={inv.invoiceId} inv={inv} currency={currency} onRefund={() => onRefund(inv)} />
      ))}
    </ul>
  );
}
