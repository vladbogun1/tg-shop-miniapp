"use client";

import { Download, ExternalLink, ReceiptText } from "lucide-react";
import type { Receipt, ReceiptKind, ReceiptStatus } from "@shop/core/receipts";
import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { CopyButton } from "@/components/ui/CopyButton";
import { receiptHref } from "../api";
import { useOrderReceiptsQuery } from "../queries";

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
export function Receipts({ orderId, currency }: { orderId: string; currency: string }) {
  const q = useOrderReceiptsQuery(orderId);
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
