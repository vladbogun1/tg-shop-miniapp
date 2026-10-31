"use client";

/** «Таймлайн»: причина отказа, ход статусов, возврат и обмены. */
import { Ban, Repeat } from "lucide-react";
import type { OrderStatus } from "@shop/core/types";
import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import type { AdminOrderDetail } from "../../api";
import { REJECT_REASON_LABEL, STATUS_LABEL, STATUS_VAR } from "../../model/status";
import type { DetailHandlers } from "./types";
import { OrderLink, Section } from "./section";

export function TimelineSection({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  return (
  <Section title="Таймлайн">
    {order.status === "REJECTED" && (order.rejectReasonCode || order.rejectReason) && (
      <div className="mb-3 flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5">
        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-ink)]" />
        <p className="text-[13px] font-medium text-[var(--danger-ink)]">
          <span className="font-display font-semibold uppercase tracking-[0.06em] opacity-80">Причина:</span>{" "}
          {order.rejectReasonCode ? REJECT_REASON_LABEL[order.rejectReasonCode] : null}
          {order.rejectReasonCode && order.rejectReason ? " — " : null}
          {order.rejectReason}
        </p>
      </div>
    )}
    <Timeline order={order} />
    {order.returnedAt && (
      <p className="mt-3 text-[12px] font-semibold text-[var(--text-muted)]">
        ↩ Возврат оформлен {formatDateTime(order.returnedAt)}
      </p>
    )}
    {(order.exchanges?.length ?? 0) > 0 && (
      <div className="mt-3 flex flex-col gap-2">
        {order.exchanges!.map((ex, i) => (
          <div key={i} className="card-2 px-3 py-2.5 text-[12.5px]">
            <div className="font-display mb-1 flex flex-wrap items-center gap-x-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)]">
              <Repeat className="h-3.5 w-3.5" /> Обмен {formatDateTime(ex.createdAt)}
              {ex.adminName && <span className="normal-case tracking-normal text-[var(--text-faint)]">· {ex.adminName}</span>}
            </div>
            <div className="text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Вернули:</span> {ex.returnedSummary}
            </div>
            <div className="text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text)]">Взамен:</span> {ex.givenSummary}
            </div>
            {ex.newOrderId ? (
              <div className="tabular text-[var(--text-faint)]">
                Зачтено {money(ex.totalBeforeMinor, order.currency)} · новый заказ{" "}
                <OrderLink id={ex.newOrderId} onOpen={h.onOpenOrder} /> на {money(ex.totalAfterMinor, order.currency)}
              </div>
            ) : (
              <div className="tabular text-[var(--text-faint)]">
                Сумма {money(ex.totalBeforeMinor, order.currency)} → {money(ex.totalAfterMinor, order.currency)}
                {ex.previousTracking ? ` · старая ТТН ${ex.previousTracking}` : ""}
              </div>
            )}
            {ex.note && <div className="text-[var(--text-faint)]">{ex.note}</div>}
          </div>
        ))}
      </div>
    )}
  </Section>
  );
}

function Timeline({ order }: { order: AdminOrderDetail }) {
  // Linear progress NEW -> APPROVED -> SHIPPED -> DELIVERED; REJECTED branches.
  const linear: OrderStatus[] = ["NEW", "APPROVED", "SHIPPED", "DELIVERED"];
  const rejected = order.status === "REJECTED";
  const reachedIdx = rejected ? 0 : linear.indexOf(order.status);

  const tsFor = (s: OrderStatus): string | null | undefined => {
    switch (s) {
      case "NEW":
        return order.createdAt;
      case "APPROVED":
        return order.approvedAt;
      case "SHIPPED":
        return order.shippedAt;
      case "DELIVERED":
        return order.deliveredAt;
      case "REJECTED":
        return order.rejectedAt;
    }
  };

  return (
    <ol className="flex flex-col gap-3">
      {linear.map((s, i) => {
        const done = i <= reachedIdx;
        const ts = tsFor(s);
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className="font-display grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold"
              style={{
                background: done ? `color-mix(in srgb, ${STATUS_VAR[s]} 16%, transparent)` : "var(--surface-2)",
                borderColor: done ? `color-mix(in srgb, ${STATUS_VAR[s]} 45%, transparent)` : "var(--line)",
                color: done ? STATUS_VAR[s] : "var(--text-faint)",
              }}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={
                done ? "text-[14px] font-semibold text-[var(--text)]" : "text-[14px] text-[var(--text-faint)]"
              }
            >
              {STATUS_LABEL[s]}
            </span>
            {ts && <span className="tabular ml-auto text-[11px] text-[var(--text-faint)]">{formatDateTime(ts)}</span>}
          </li>
        );
      })}
      {rejected && (
        <li className="flex items-center gap-3">
          <span className="font-display grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-[11px] font-bold text-[var(--danger-ink)]">
            ✕
          </span>
          <span className="text-[14px] font-semibold text-[var(--danger-ink)]">{STATUS_LABEL.REJECTED}</span>
          {order.rejectedAt && (
            <span className="ml-auto text-[11px] text-[var(--text-faint)]">{formatDateTime(order.rejectedAt)}</span>
          )}
        </li>
      )}
    </ol>
  );
}
