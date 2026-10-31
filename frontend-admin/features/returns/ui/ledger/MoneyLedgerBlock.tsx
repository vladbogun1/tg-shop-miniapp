"use client";

/**
 * «Деньги по заказу» — журнал денег заказа (V68): каждая оплата, возврат, удержание и поправка с каналом, автором
 * и заметкой; итоги под ним. Строки, восстановленные 25.10.2026 из старых данных (source BACKFILL), серые.
 * Ниже — единицы, списанные как брак, с кнопкой «Вернуть на склад» (V70).
 */
import { useState } from "react";
import { money } from "@/lib/money";
import { ledgerTotals } from "../../model/ledger";
import type { ReturnOrder } from "../../model/types";
import { RestoreWriteoffModal } from "../RestoreWriteoffModal";
import { LedgerRows } from "./LedgerRows";
import { WriteoffList } from "./WriteoffList";

export function MoneyLedgerBlock({ order, onChanged }: { order: ReturnOrder; onChanged?: () => void }) {
  const [restoring, setRestoring] = useState<{
    id: number;
    title: string;
    left: number;
  } | null>(null);
  const admin = order.admin;
  if (!admin) return null;
  const rows = admin.movements ?? [];
  const writeoffs = admin.writeoffs ?? [];
  if (rows.length === 0 && writeoffs.length === 0) return null;
  const cur = order.currency;
  const { paid, refunded, retained } = ledgerTotals(rows, order);

  return (
    <section className="card p-4">
      <div className="mb-3 flex min-h-7 items-center">
        <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Деньги по заказу</h3>
      </div>

      {rows.length > 0 && <LedgerRows rows={rows} cur={cur} />}

      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-[13px] text-[var(--text-muted)]">
          <span>
            Получено <b className="tabular text-[var(--text)]">{money(paid, cur)}</b>
          </span>
          <span>
            Возвращено <b className="tabular text-[var(--text)]">{money(refunded, cur)}</b>
          </span>
          {/* Удержание только при отказе от посылки (предоплата идёт за доставку) — иначе строки нет. */}
          {retained > 0 && (
            <span>
              Удержано за доставку <b className="tabular text-[var(--text)]">{money(retained, cur)}</b>
            </span>
          )}
        </div>
      )}

      {writeoffs.length > 0 && <WriteoffList writeoffs={writeoffs} cur={cur} onRestore={setRestoring} />}
      <RestoreWriteoffModal writeoff={restoring} onClose={() => setRestoring(null)} onDone={() => onChanged?.()} />
    </section>
  );
}
