"use client";

/**
 * Order lifecycle NEW → APPROVED → SHIPPED → DELIVERED (REJECTED as its own block). Adapted from
 * the Mini App's vertical timeline: horizontal on wide screens, vertical on phones.
 */
import { Check, X } from "lucide-react";
import { ORDER_STATUS_COLOR, ORDER_TIMELINE, type OrderDetail, type OrderStatus } from "@shop/shared";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";

function stampOf(order: OrderDetail, s: OrderStatus): string | null | undefined {
  switch (s) {
    case "NEW":
      return order.createdAt;
    case "APPROVED":
      return order.approvedAt;
    case "SHIPPED":
      return order.shippedAt;
    case "DELIVERED":
      return order.deliveredAt;
    default:
      return null;
  }
}

export function StatusTimeline({ order }: { order: OrderDetail }) {
  const t = useT();
  const fmt = useFmt();
  if (order.status === "REJECTED") {
    return (
      <div className="flex items-center gap-3 rounded-[var(--r-card)] border border-[color-mix(in_srgb,var(--st-rejected)_45%,transparent)] bg-[color-mix(in_srgb,var(--st-rejected)_12%,transparent)] p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--st-rejected)] text-white">
          <X className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <p className="nb-up text-[14px] font-bold text-[var(--st-rejected)]">{t("timeline.rejected.title")}</p>
          <p className="text-[12px] text-[var(--ink)]">
            {order.rejectedAt ? `${fmt.dateTime(order.rejectedAt)} · ` : ""}
            {t("timeline.rejected.text")}
          </p>
        </div>
      </div>
    );
  }
  const currentIdx = ORDER_TIMELINE.indexOf(order.status);
  return (
    <ol className="flex flex-col gap-0 md:flex-row md:gap-2">
      {ORDER_TIMELINE.map((s, i) => {
        const done = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const color = ORDER_STATUS_COLOR[s];
        const stamp = stampOf(order, s);
        return (
          <li key={s} className="flex flex-1 gap-3 md:flex-col md:gap-2">
            <div className="flex flex-col items-center md:flex-row">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border font-display text-[13px] font-bold"
                style={{
                  background: done ? `color-mix(in srgb, ${color} 18%, transparent)` : "var(--surface-2)",
                  borderColor: done ? color : "var(--line-strong)",
                  color: done ? color : "var(--faint)",
                  boxShadow: isCurrent ? `0 0 14px color-mix(in srgb, ${color} 55%, transparent)` : "none",
                }}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : i + 1}
              </span>
              {i < ORDER_TIMELINE.length - 1 && (
                <span
                  aria-hidden
                  className="my-1 min-h-[20px] w-[2px] flex-1 rounded-full md:mx-2 md:my-0 md:h-[2px] md:min-h-0 md:w-auto"
                  style={{ background: i < currentIdx ? color : "var(--line-strong)", opacity: i < currentIdx ? 0.8 : 1 }}
                />
              )}
            </div>
            <div className="pb-4 md:pb-0">
              <p className="text-[14px] font-semibold" style={{ color: done ? "var(--ink)" : "var(--faint)" }}>
                {t(`status.${s}` as MessageKey)}
              </p>
              {done && stamp && <p className="text-[12px] text-[var(--muted)]">{fmt.dateTime(stamp)}</p>}
              {isCurrent && <p className="nb-up text-[11px] font-semibold text-[var(--accent-hi)]">{t("timeline.current")}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
