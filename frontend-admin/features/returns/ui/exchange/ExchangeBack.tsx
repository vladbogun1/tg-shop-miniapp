"use client";

import { money } from "@/lib/money";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { exchangeLeft } from "../../model/exchange";
import type { ExchangeOutcome } from "../../api";
import type { ExchangeDraft } from "./use-exchange-draft";
import type { ReturnOrder } from "../../model/types";
import { Stepper } from "./Stepper";

export function ExchangeBack({ d, order }: { d: ExchangeDraft; order: ReturnOrder }) {
  const cur = order.currency;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="field-label">1. Что вернул покупатель</div>
      {order.items.map((it, i) => {
        if (it.id == null) return null;
        const left = exchangeLeft(it);
        if (left <= 0) return null;
        const l = d.back[it.id] ?? { qty: 0, outcome: d.defaultOutcome };
        return (
          <div key={it.id ?? i} className="card-2 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                  {it.gift && "🎁 "}
                  {it.title}
                </div>
                <div className="text-[12px] text-[var(--text-faint)]">
                  {it.variantName ? `${it.variantName} · ` : ""}
                  {money(it.unitPaidMinor ?? it.priceMinor, cur)} · в заказе {left} шт.
                </div>
              </div>
              <Stepper value={l.qty} min={0} max={left} onChange={(n) => d.setBackLine(it.id!, { qty: n })} />
            </div>
            {l.qty > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                <SegmentedControl
                  options={[
                    { value: "IN_TRANSIT", label: "Едет назад" },
                    { value: "RESTOCK", label: "Уже у нас — на склад" },
                    { value: "DEFECT", label: "Брак" },
                  ]}
                  value={l.outcome}
                  onChange={(v) => d.setBackLine(it.id!, { outcome: v as ExchangeOutcome })}
                />
                <span className="text-[12px] text-[var(--text-faint)]">
                  {l.outcome === "IN_TRANSIT"
                    ? "Покупатель отправит посылкой — заказ появится в «Едет назад»; когда приедет, нажмёте «Посылка вернулась»."
                    : l.outcome === "RESTOCK"
                      ? `Товар уже у вас — +${l.qty} шт. на склад сразу.`
                      : "Товар не в продажном виде — будет списан (попадёт в «Списания»), на склад не вернётся."}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
