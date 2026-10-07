"use client";

/**
 * «Чеки» on the order page of the Mini App: the fiscal checks of the sale / refunds (Вчасно.Каса
 * through monobank) and the bank's receipt per paid invoice — GET /api/me/orders/{id}/receipts.
 *
 * Read only once money came in online; while a fiscal check is being issued (or a fresh payment
 * has none listed yet) it is read again every 20 s for at most five minutes (`receiptsPollMs`).
 *
 * Downloading: a webview ignores `<a download>` and cannot add the bearer token, so `downloadUrl`
 * is a signed link valid ~10 minutes. {@link downloadFile} shows Telegram's own download dialog
 * (Bot API 8.0+) or opens the link in the browser over the Mini App. A list older than 8 minutes
 * is re-read first, so the link is never stale. The bot also sends each fiscal check as a PDF.
 * Renders nothing until there is something to show (it is a child of the page's stagger list).
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Download, ExternalLink, ReceiptText } from "lucide-react";
import { useRef, useState } from "react";
import {
  hasOnlinePayment,
  receiptFileName,
  receiptsPollMs,
  type Receipt,
  type ReceiptStatus,
} from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/context";
import { customerApi, mediaUrl, type OrderDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { money } from "@/lib/money";
import { riseItem } from "@/lib/motion";
import { downloadFile, haptic, openExternalLink } from "@/lib/telegram";

/** Signed links live ≥ 10 min; re-read the list before using one older than this. */
const LINK_FRESH_MS = 8 * 60_000;

const CHIP: Record<ReceiptStatus, string> = {
  PENDING: "var(--warn)",
  READY: "var(--ok)",
  FAILED: "var(--danger)",
};

export function OrderReceipts({ order }: { order: OrderDetail }) {
  const { t } = useI18n();
  const enabled = hasOnlinePayment(order);
  const since = useRef(Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const { data, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["me", "orders", order.id, "receipts"],
    queryFn: () => customerApi.getReceipts(order.id),
    enabled,
    staleTime: 30_000,
    refetchInterval: (q) => receiptsPollMs(q.state.data, since.current),
  });
  if (!enabled || !data || data.length === 0) return null;

  async function download(r: Receipt) {
    haptic();
    let url = r.downloadUrl;
    if (Date.now() - dataUpdatedAt > LINK_FRESH_MS) {
      setBusy(r.key);
      try {
        const fresh = await refetch();
        url = fresh.data?.find((x) => x.key === r.key)?.downloadUrl ?? null;
      } finally {
        setBusy(null);
      }
    }
    const abs = mediaUrl(url);
    if (abs) downloadFile(abs, receiptFileName(order.id, r.kind));
  }

  return (
    <motion.section variants={riseItem} className="nb p-4">
      <h3 className="eyebrow mb-3 flex items-center gap-2 !text-[10px] !tracking-[0.2em]">
        <ReceiptText className="h-4 w-4" strokeWidth={2.25} /> {t("receipts.title")}
      </h3>
      <ul className="flex flex-col divide-y divide-[var(--line)]">
        {data.map((r) => {
          const meta = [
            r.amountMinor != null ? money(r.amountMinor, order.currency) : null,
            r.createdAt ? formatDateTime(r.createdAt) : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={r.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--ink)]">
                  {t(`receipts.kind.${r.kind}`)}
                  <StatusChip status={r.status} />
                </p>
                {meta && <p className="mt-0.5 text-[12px] text-[var(--muted)]">{meta}</p>}
                {r.status !== "READY" && (
                  <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                    {/* statusText is monobank's own wording (Ukrainian/English) — the customer gets ours. */}
                    {r.status === "PENDING" ? t("receipts.pendingHint") : t("receipts.failedHint")}
                  </p>
                )}
              </div>
              {(r.downloadUrl || r.taxUrl) && (
                <div className="flex flex-wrap gap-2">
                  {r.downloadUrl && (
                    <Button
                      type="button"
                      size="sm"
                      loading={busy === r.key}
                      icon={<Download className="h-4 w-4" strokeWidth={2.5} />}
                      onClick={() => void download(r)}
                    >
                      {t("receipts.download")}
                    </Button>
                  )}
                  {r.taxUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={<ExternalLink className="h-4 w-4" strokeWidth={2.25} />}
                      onClick={() => {
                        haptic();
                        openExternalLink(r.taxUrl!);
                      }}
                    >
                      {t("receipts.tax")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}

function StatusChip({ status }: { status: ReceiptStatus }) {
  const { t } = useI18n();
  const c = CHIP[status];
  return (
    <span
      className="font-display rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      {t(`receipts.status.${status}`)}
    </span>
  );
}
