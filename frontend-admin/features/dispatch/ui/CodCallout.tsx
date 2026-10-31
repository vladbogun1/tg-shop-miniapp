import { CopyButton } from "@/components/ui/CopyButton";
import type { AdminDispatchOrder } from "@/features/order";
import { money } from "@shop/core/money";
import type { CSSProperties } from "react";
import { plainAmount } from "../model/dispatch";

const BASE = "rounded-[var(--r-md)] border px-4 py-3.5";
const BIG = "font-display tabular text-[20px] font-extrabold uppercase leading-tight tracking-[0.02em] sm:text-[24px]";
const SUB = "font-display mt-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

/**
 * The most prominent thing on the card: a tinted panel in the state colour (ok / warn / danger at
 * 10%, hairline at 40%) with the amount in big Exo 2 in that colour — no solid fill under text.
 */
export function CodCallout({ o }: { o: AdminDispatchOrder }) {
  const paidInFull = o.codMinor === 0;
  const tone = paidInFull ? "var(--ok)" : o.receivedMinor > 0 ? "var(--warn)" : "var(--danger)";
  const ink = paidInFull ? "var(--ok)" : o.receivedMinor > 0 ? "var(--warn)" : "var(--danger-ink)";
  const style = {
    background: `color-mix(in srgb, ${tone} 10%, transparent)`,
    borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
  } as CSSProperties;

  // Paid in full — no COD.
  if (paidInFull) {
    return (
      <div className={BASE} style={style}>
        <div className={BIG} style={{ color: ink }}>Наложка: 0</div>
        <div className={SUB}>Оплачено, без наложки</div>
      </div>
    );
  }

  return (
    <div className={BASE} style={style}>
      <div className="flex items-center justify-between gap-2">
        <div className={BIG} style={{ color: ink }}>
          Наложка: {money(o.codMinor, o.currency)}
        </div>
        <CopyButton value={plainAmount(o.codMinor)} label="Скопировать сумму наложки" />
      </div>
      <div className={SUB}>
        {o.receivedMinor > 0
          ? `(сумма ${money(o.totalMinor, o.currency)} − получено ${money(o.receivedMinor, o.currency)})`
          : "Не оплачено"}
      </div>
    </div>
  );
}
