import { MOVEMENT_CHANNEL_LABEL, MOVEMENT_KIND_LABEL } from "@/features/payment";
import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { isRefundBack, ledgerSign, ledgerTone, type LedgerTone } from "../../model/ledger";
import type { OrderMovement } from "../../model/types";

const TONE_CLASS: Record<LedgerTone, string> = {
  faint: "text-[var(--text-faint)]",
  ok: "text-[var(--ok)]",
  text: "text-[var(--text)]",
  danger: "text-[var(--danger-ink)]",
};

function rowTitle(m: OrderMovement): string {
  if (!isRefundBack(m)) return `${MOVEMENT_KIND_LABEL[m.kind]} · ${MOVEMENT_CHANNEL_LABEL[m.channel]}`;
  return m.channel === "EXCHANGE"
    ? "Зачёт вернулся в заказ"
    : `Покупатель вернул · ${MOVEMENT_CHANNEL_LABEL[m.channel]}`;
}

function LedgerRow({ m, cur }: { m: OrderMovement; cur: string }) {
  const restored = m.source === "BACKFILL";
  return (
    <div className={cn("flex flex-col gap-0.5 py-2 first:pt-0", restored && "text-[var(--text-faint)]")}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn("text-[13.5px] font-semibold", !restored && "text-[var(--text)]")}>{rowTitle(m)}</span>
        <span className={cn("tabular shrink-0 text-[14px] font-bold", TONE_CLASS[ledgerTone(m)])}>
          {ledgerSign(m)}
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
}

/** Строки журнала денег: оплаты, возвраты, удержания, поправки — с каналом, автором и заметкой. */
export function LedgerRows({ rows, cur }: { rows: OrderMovement[]; cur: string }) {
  return (
    <div className="flex flex-col divide-y divide-[var(--line)]">
      {rows.map((m) => (
        <LedgerRow key={m.id} m={m} cur={cur} />
      ))}
    </div>
  );
}
