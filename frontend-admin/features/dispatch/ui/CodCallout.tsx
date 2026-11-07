import { CopyButton } from "@/components/ui/CopyButton";
import type { AdminDispatchOrder } from "@/features/order";
import { money } from "@shop/core/money";
import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { plainAmount } from "../model/dispatch";

const BIG = "font-display tabular text-[22px] font-extrabold uppercase leading-tight tracking-[0.02em]";
const SUB = "font-display mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]";

/**
 * The most prominent thing on the card, right under the name: a tinted panel in the state colour
 * (warn / danger at 10%, hairline at 40%) with the amount in big Exo 2 in that colour — no solid fill
 * under text. Paid in full: a thin green chip instead, there is nothing to collect.
 */
export function CodCallout({ o }: { o: AdminDispatchOrder }) {
  const paidInFull = o.codMinor === 0;

  if (paidInFull) {
    return (
      <div className="chip-tint !h-7 !w-fit !px-3 !text-[11.5px]" style={{ "--chip": "var(--ok)" } as CSSProperties}>
        <Check className="h-3.5 w-3.5" />
        Оплачено, без наложки
      </div>
    );
  }

  const partial = o.receivedMinor > 0;
  const tone = partial ? "var(--warn)" : "var(--danger)";
  const ink = partial ? "var(--warn)" : "var(--danger-ink)";
  const style = {
    background: `color-mix(in srgb, ${tone} 10%, transparent)`,
    borderColor: `color-mix(in srgb, ${tone} 40%, transparent)`,
  } as CSSProperties;

  return (
    <div className="rounded-[var(--r-md)] border px-3 py-2.5" style={style}>
      <div className="flex items-center justify-between gap-2">
        <div className={BIG} style={{ color: ink }}>
          Наложка: {money(o.codMinor, o.currency)}
        </div>
        <CopyButton value={plainAmount(o.codMinor)} label="Скопировать сумму наложки" className="pointer-coarse:h-11 pointer-coarse:w-11" />
      </div>
      <div className={SUB}>
        {partial ? `(сумма ${money(o.totalMinor, o.currency)} − получено ${money(o.receivedMinor, o.currency)})` : "Не оплачено"}
      </div>
    </div>
  );
}
