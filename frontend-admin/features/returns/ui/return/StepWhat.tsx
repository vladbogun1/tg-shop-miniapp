"use client";

import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { ChoiceCard } from "../parts";
import type { ReturnWizard } from "./use-return-wizard";
import { GiftSection, PaidLineRow } from "./WhatLines";
import { whereOptions } from "./where-options";

/** Итоговая подсказка шага: отказ от посылки, снятое с наложки или сколько заплатил покупатель. */
function WhatNote({ w }: { w: ReturnWizard }) {
  const { where } = w.choice;
  const { cur, pickup, units, goodsValue, codBefore, codAfter, refusedAll } = w.d!;
  if (refusedAll) {
    return (
      <p className="text-[12.5px] font-medium text-[var(--warn)]">
        Покупатель не забирает ничего — это отказ от посылки: отклоните заказ с «Посылка едет назад».
      </p>
    );
  }
  if (units > 0 && pickup) {
    return (
      <p className="text-[12.5px] text-[var(--text-muted)]">
        Не выкуплено на <b className="tabular text-[var(--text)]">{money(goodsValue, cur)}</b> — наложка станет{" "}
        <b className="tabular text-[var(--text)]">{money(codAfter, cur)}</b> вместо {money(codBefore, cur)}.
      </p>
    );
  }
  if (units > 0 && where !== "KEPT") {
    return (
      <p className="text-[12.5px] text-[var(--text-muted)]">
        Покупатель заплатил за это <b className="tabular text-[var(--text)]">{money(goodsValue, cur)}</b> (по цене
        продажи, со скидкой).
      </p>
    );
  }
  return null;
}

export function StepWhat({ w }: { w: ReturnWizard }) {
  const { where } = w.choice;
  const { cur, paidLines, askGift } = w.d!;
  const options = whereOptions(w.d!.delivered, w.d!.shipped);
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="field-label">Где сейчас товар?</div>
        <div className={cn("grid gap-2", options.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
          {options.map((o) => (
            <ChoiceCard
              key={o.value}
              active={where === o.value}
              onClick={() => w.setWhere(o.value)}
              icon={o.icon}
              label={o.label}
            />
          ))}
        </div>
        <p className="text-[12px] text-[var(--text-faint)]">{options.find((o) => o.value === where)?.hint}</p>
      </section>

      <section className="flex flex-col gap-2">
        <div className="field-label">{where === "KEPT" ? "За какой товар компенсация?" : "Что возвращают?"}</div>
        {paidLines.length === 0 && (
          <p className="text-[13px] text-[var(--text-muted)]">Все позиции уже возвращены или едут назад.</p>
        )}
        {paidLines.map((it) => (
          <PaidLineRow key={it.id} w={w} it={it} cur={cur} />
        ))}
      </section>

      {askGift && <GiftSection w={w} />}
      <WhatNote w={w} />
    </div>
  );
}
