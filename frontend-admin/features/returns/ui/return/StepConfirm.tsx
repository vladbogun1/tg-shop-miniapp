"use client";

import { money } from "@/lib/money";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { outcomeText, unitsLeft } from "../../model/return-wizard";
import { SummaryRow } from "../parts";
import type { ReturnWizard } from "./use-return-wizard";

export function StepConfirm({ w }: { w: ReturnWizard }) {
  const { where, picked, defect, giftChoice } = w.choice;
  const { cur, pickup, units, codBefore, codAfter, amountMinor, useMono, paidLines, giftLines, askGift } = w.d!;
  return (
    <div className="flex flex-col gap-3">
      {units > 0 && (
        <div className="flex flex-col gap-1.5">
          {paidLines
            .filter((it) => (picked[it.id!] ?? 0) > 0)
            .map((it) => {
              const q = picked[it.id!] ?? 0;
              const d = where === "HERE" ? Math.min(defect[it.id!] ?? 0, q) : 0;
              return <SummaryRow key={it.id} item={it} qty={q} text={outcomeText(where, d, q)} danger={d > 0} />;
            })}
          {askGift &&
            giftLines.map((g) => (
              <SummaryRow
                key={g.id}
                item={g}
                qty={unitsLeft(g)}
                gift
                text={
                  giftChoice[g.id!] === "TAKE"
                    ? where === "POST"
                      ? "забираем — едет к нам"
                      : "забираем — на склад"
                    : "остаётся у покупателя"
                }
              />
            ))}
        </div>
      )}
      <div className="card-2 flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
        <span className="text-[var(--text-muted)]">
          {amountMinor === 0
            ? "Деньги не возвращаем"
            : useMono
              ? "Вернём автоматически через monobank"
              : "Вернёте с личных средств"}
        </span>
        {amountMinor > 0 && <b className="tabular text-[15px] text-[var(--text)]">{money(amountMinor, cur)}</b>}
      </div>
      {pickup && units > 0 && (
        <div className="card-2 flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
          <span className="text-[var(--text-muted)]">Наложка: {money(codBefore, cur)} →</span>
          <b className="tabular text-[15px] text-[var(--text)]">{money(codAfter, cur)}</b>
        </div>
      )}
      {where === "POST" && units > 0 && (
        <p className="text-[12.5px] text-[var(--text-muted)]">
          Заказ появится в колонке «Едет назад». Когда посылка придёт — откройте его и нажмите «Посылка вернулась».
        </p>
      )}
      <Input
        label="Комментарий (в журнал)"
        value={w.note}
        onChange={(e) => w.setNote(e.target.value)}
        maxLength={500}
      />
      <Toggle checked={w.notify} onChange={w.setNotify} label="Сообщить покупателю в Telegram" />
    </div>
  );
}
