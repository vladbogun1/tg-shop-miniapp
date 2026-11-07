"use client";

/** Исход заказа: причина отказа (для REJECTED), «Возврат оформлен …» и карточки обменов (были в «Таймлайне»). */
import { Ban, Repeat } from "lucide-react";
import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import type { AdminOrderDetail } from "../../api";
import { REJECT_REASON_LABEL } from "../../model/status";
import type { DetailHandlers } from "./types";
import { OrderLink } from "./section";

/** «Требует внимания» у отклонённого: причина (метка + текст клиента/админа). */
export function RejectReason({ order }: { order: AdminOrderDetail }) {
  if (order.status !== "REJECTED" || !(order.rejectReasonCode || order.rejectReason)) return null;
  return (
    <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5">
      <Ban className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger-ink)]" />
      <p className="text-[13px] font-medium text-[var(--danger-ink)]">
        <span className="font-display font-semibold uppercase tracking-[0.06em] opacity-80">Причина:</span>{" "}
        {order.rejectReasonCode ? REJECT_REASON_LABEL[order.rejectReasonCode] : null}
        {order.rejectReasonCode && order.rejectReason ? " — " : null}
        {order.rejectReason}
      </p>
    </div>
  );
}

/** «↩ Возврат оформлен …» и карточки обменов; нет ни того ни другого — ничего не рисуем. */
export function ExchangeCards({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  const exchanges = order.exchanges ?? [];
  if (!order.returnedAt && exchanges.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {order.returnedAt && (
        <p className="px-1 text-[12px] font-semibold text-[var(--text-muted)]">↩ Возврат оформлен {formatDateTime(order.returnedAt)}</p>
      )}
      {exchanges.map((ex, i) => (
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
              Зачтено {money(ex.totalBeforeMinor, order.currency)} · новый заказ <OrderLink id={ex.newOrderId} onOpen={h.onOpenOrder} /> на{" "}
              {money(ex.totalAfterMinor, order.currency)}
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
  );
}
