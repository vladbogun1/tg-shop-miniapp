"use client";

/**
 * «Чеки» on the order page: the fiscal checks of the sale / refunds (Вчасно.Каса through monobank)
 * and the bank's receipt for every paid invoice — GET /api/me/orders/{id}/receipts.
 *
 * Read lazily, only once money came in online. A fiscal check is issued a minute or two after the
 * payment, so while one is being issued (or a fresh payment has none listed yet) the list is read
 * again every 20 s, for at most five minutes (shared `receiptsPollMs`). Downloads are plain links:
 * `downloadUrl` is a short-lived signed same-origin URL that answers with `Content-Disposition:
 * attachment`; links are re-signed on every refetch, and the list is refetched on focus.
 */
import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, ReceiptText } from "lucide-react";
import { useRef } from "react";
import { hasOnlinePayment, receiptsPollMs, type OrderDetail, type Receipt, type ReceiptStatus } from "@shop/shared";
import { buttonClass } from "@/components/ui/button-styles";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useFmt } from "@/lib/use-fmt";

const CHIP: Record<ReceiptStatus, string> = {
  PENDING: "var(--warn)",
  READY: "var(--ok)",
  FAILED: "var(--danger)",
};

export function OrderReceipts({ order }: { order: OrderDetail }) {
  const enabled = hasOnlinePayment(order);
  const since = useRef(Date.now());
  const { data } = useQuery({
    queryKey: ["me", "orders", order.id, "receipts"],
    queryFn: () => api.receipts(order.id),
    enabled,
    staleTime: 30_000,
    refetchInterval: (q) => receiptsPollMs(q.state.data, since.current),
  });
  if (!enabled || !data || data.length === 0) return null;
  return <ReceiptList list={data} currency={order.currency} />;
}

function ReceiptList({ list, currency }: { list: Receipt[]; currency: string }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const meta = (r: Receipt) =>
    [r.amountMinor != null ? fmt.money(r.amountMinor, currency) : null, r.createdAt ? fmt.dateTime(r.createdAt) : null]
      .filter(Boolean)
      .join(" · ");
  return (
    <section className="nb p-5" aria-live="polite">
      <h3 className="eyebrow mb-3 flex items-center gap-2 text-[11px]">
        <ReceiptText className="h-4 w-4 text-[var(--accent)]" strokeWidth={2.25} /> {t("receipts.title")}
      </h3>
      <ul className="flex flex-col divide-y divide-[var(--line)]">
        {list.map((r) => (
          <li key={r.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
                {t(`receipts.kind.${r.kind}`)}
                <StatusChip status={r.status} />
              </p>
              {meta(r) && <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">{meta(r)}</p>}
              {r.status !== "READY" && (
                <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">
                  {/* statusText is monobank's own wording (Ukrainian/English) — the customer gets ours. */}
                  {r.status === "PENDING" ? t("receipts.pendingHint") : t("receipts.failedHint")}
                </p>
              )}
            </div>
            {(r.downloadUrl || r.taxUrl) && (
              <div className="flex shrink-0 flex-wrap gap-2">
                {r.downloadUrl && (
                  <a href={r.downloadUrl} download className={buttonClass("surface", "sm")}>
                    <Download className="h-4 w-4" strokeWidth={2.25} />
                    <span className="truncate">{t("receipts.download")}</span>
                  </a>
                )}
                {r.taxUrl && (
                  <a href={r.taxUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                    <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
                    <span className="truncate">{t("receipts.tax")}</span>
                  </a>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusChip({ status }: { status: ReceiptStatus }) {
  const { t } = useI18n();
  const c = CHIP[status];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.06em]"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      {t(`receipts.status.${status}`)}
    </span>
  );
}
