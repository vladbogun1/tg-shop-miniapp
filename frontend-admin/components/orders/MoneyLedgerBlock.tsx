"use client";

/**
 * «Деньги по заказу» — the order's money journal (V68): every incoming payment, refund, retained
 * amount and correction with its channel, who recorded it and a note; totals underneath.
 * Rows restored on 25.10.2026 from the old data (source BACKFILL) are grey and marked.
 * Below: the units written off as брак («Списано как брак») with «Вернуть на склад» (V70).
 */
import { useState } from "react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { formatDateTime, MOVEMENT_CHANNEL_LABEL, MOVEMENT_KIND_LABEL } from "@/lib/orders";
import type { AdminOrderDetail, OrderMovement } from "@/lib/orders-api";
import { RestoreWriteoffModal } from "./RestoreWriteoffModal";

/** Signed contribution of a row to «получено» (correction may be negative). */
function sum(rows: OrderMovement[], kind: OrderMovement["kind"]): number {
  return rows.filter((m) => m.kind === kind).reduce((s, m) => s + m.amountMinor, 0);
}

export function MoneyLedgerBlock({ order, onChanged }: { order: AdminOrderDetail; onChanged?: () => void }) {
  const [restoring, setRestoring] = useState<{ id: number; title: string; left: number } | null>(null);
  const admin = order.admin;
  if (!admin) return null;
  const rows = admin.movements ?? [];
  const writeoffs = admin.writeoffs ?? [];
  if (rows.length === 0 && writeoffs.length === 0) return null;
  const cur = order.currency;

  const paid = sum(rows, "PAYMENT") + sum(rows, "CORRECTION");
  const refunded = sum(rows, "REFUND");
  const retained = sum(rows, "RETAINED");

  return (
    <section className="card p-4">
      <div className="mb-3 flex min-h-7 items-center">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Деньги по заказу</h3>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col divide-y divide-[var(--line)]">
          {rows.map((m) => {
            const restored = m.source === "BACKFILL";
            // A cancelled return (V70): the refund comes back as a negative refund — money in, not out.
            const back = m.kind === "REFUND" && m.amountMinor < 0;
            const negative = (m.kind === "REFUND" && !back) || m.amountMinor < 0;
            return (
              <div key={m.id} className={cn("flex flex-col gap-0.5 py-2 first:pt-0", restored && "text-[var(--text-faint)]")}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn("text-[13.5px] font-semibold", !restored && "text-[var(--text)]")}>
                    {back
                      ? m.channel === "EXCHANGE"
                        ? "Зачёт вернулся в заказ"
                        : `Покупатель вернул · ${MOVEMENT_CHANNEL_LABEL[m.channel]}`
                      : `${MOVEMENT_KIND_LABEL[m.kind]} · ${MOVEMENT_CHANNEL_LABEL[m.channel]}`}
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 text-[14px] font-bold",
                      restored
                        ? "text-[var(--text-faint)]"
                        : m.kind === "PAYMENT" || back
                          ? "text-[var(--ok)]"
                          : m.kind === "RETAINED"
                            ? "text-[var(--text)]"
                            : negative
                              ? "text-[var(--danger-ink)]"
                              : "text-[var(--text)]"
                    )}
                  >
                    {m.kind === "PAYMENT" || back ? "+" : m.kind === "REFUND" ? "−" : ""}
                    {money(Math.abs(m.amountMinor), cur)}
                  </span>
                </div>
                <div className="text-[12px] text-[var(--text-faint)]">
                  {formatDateTime(m.occurredAt)}
                  {m.adminName && ` · ${m.adminName}`}
                  {restored && " · восстановлено 25.10"}
                  {m.note && ` · ${m.note}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-[13px] text-[var(--text-muted)]">
          <span>
            Получено <b className="tabular text-[var(--text)]">{money(paid, cur)}</b>
          </span>
          <span>
            Возвращено <b className="tabular text-[var(--text)]">{money(refunded, cur)}</b>
          </span>
          {/* Kept only on a refused parcel (the prepayment pays for delivery) — no line when nothing was kept. */}
          {(retained || admin.retainedMinor) > 0 && (
            <span>
              Удержано за доставку{" "}
              <b className="tabular text-[var(--text)]">{money(retained || admin.retainedMinor, cur)}</b>
            </span>
          )}
        </div>
      )}

      {writeoffs.length > 0 && (
        <div className="mt-3 border-t border-[var(--line)] pt-3">
          <div className="field-label mb-1.5">Списано как брак</div>
          <ul className="flex flex-col gap-1 text-[12.5px] text-[var(--text-muted)]">
            {writeoffs.map((w, i) => {
              const undone = w.undoneQty ?? 0;
              const left = w.quantity - undone;
              return (
                <li key={w.id || i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className={cn("text-[var(--text)]", left <= 0 && "line-through opacity-60")}>
                      {w.title} ×{w.quantity}
                    </span>
                    {w.unitValueMinor > 0 && left > 0 && <> · {money(w.unitValueMinor * left, cur)}</>}
                    {w.reason && <> · {w.reason}</>}
                    {w.note && <> · {w.note}</>}
                    {undone > 0 && (
                      <span className="text-[var(--ok)]">
                        {" "}
                        · вернули {undone} шт{w.undoneNote ? ` (${w.undoneNote})` : ""}
                      </span>
                    )}
                    <span className="text-[var(--text-faint)]">
                      {" "}
                      · {formatDateTime(w.createdAt)}
                      {w.adminName && ` · ${w.adminName}`}
                    </span>
                  </span>
                  {left > 0 && w.id > 0 && (
                    <button
                      type="button"
                      onClick={() => setRestoring({ id: w.id, title: w.title, left })}
                      className="shrink-0 text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline"
                    >
                      Вернуть на склад
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <RestoreWriteoffModal writeoff={restoring} onClose={() => setRestoring(null)} onDone={() => onChanged?.()} />
    </section>
  );
}
