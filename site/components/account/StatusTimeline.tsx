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
      <div className="flex items-center gap-3 rounded-[var(--r)] border-[3px] border-[var(--line)] bg-[var(--danger)] p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center border-[2.5px] border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
          <X className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="nb-up text-[14px] font-black text-white">{t("timeline.rejected.title")}</p>
          <p className="text-[12px] font-semibold text-white/90">
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
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r)] border-[2.5px] border-[var(--line)] text-[13px] font-black"
                style={{
                  background: done ? color : "var(--surface-2)",
                  color: done ? "var(--accent-ink)" : "var(--faint)",
                  boxShadow: isCurrent ? "3px 3px 0 var(--shadow)" : "none",
                }}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              {i < ORDER_TIMELINE.length - 1 && (
                <span
                  aria-hidden
                  className="my-1 min-h-[20px] w-[3px] flex-1 md:mx-2 md:my-0 md:h-[3px] md:min-h-0 md:w-auto"
                  style={{ background: i < currentIdx ? color : "var(--line)", opacity: i < currentIdx ? 1 : 0.35 }}
                />
              )}
            </div>
            <div className="pb-4 md:pb-0">
              <p className="text-[14px] font-extrabold" style={{ color: done ? "var(--ink)" : "var(--faint)" }}>
                {t(`status.${s}` as MessageKey)}
              </p>
              {done && stamp && <p className="text-[12px] font-semibold text-[var(--muted)]">{fmt.dateTime(stamp)}</p>}
              {isCurrent && <p className="nb-up text-[11px] font-black text-[var(--accent)]">{t("timeline.current")}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
