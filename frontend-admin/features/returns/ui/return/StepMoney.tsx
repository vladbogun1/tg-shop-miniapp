"use client";

import { Banknote, CreditCard } from "lucide-react";
import { money } from "@/lib/money";
import { Input } from "@/components/ui/Input";
import { amountHint } from "../../model/return-wizard";
import type { ReturnOrder } from "../../model/types";
import { ChoiceCard } from "../parts";
import type { ReturnWizard } from "./use-return-wizard";

/** Что покупатель заплатил и что снимется с наложки — карточки над полем суммы. */
function MoneyContext({ w, order }: { w: ReturnWizard; order: ReturnOrder }) {
  const { where } = w.choice;
  const { cur, moneyOnly, pickup, goodsValue, codAfter, overpaid, cap } = w.d!;
  return (
    <>
      {moneyOnly && (
        <p className="text-[13px] text-[var(--text-muted)]">
          {order.status === "REJECTED"
            ? "Заказ отклонён — товар принимается кнопкой «Посылка вернулась». Здесь — только деньги."
            : `Заказ ещё не отправлен — вернуть можно только переплату: ${money(overpaid, cur)}.`}
        </p>
      )}
      {pickup && (
        <div className="card-2 flex flex-col gap-1.5 px-3 py-2.5 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-muted)]">Не выкуплено — снимется с наложки</span>
            <b className="tabular text-[15px] text-[var(--text)]">{money(goodsValue, cur)}</b>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--text-muted)]">Наложка станет</span>
            <b className="tabular text-[15px] text-[var(--text)]">{money(codAfter, cur)}</b>
          </div>
        </div>
      )}
      {!moneyOnly && where !== "KEPT" && !pickup && (
        <div className="card-2 flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
          <span className="text-[var(--text-muted)]">Заплатил за возвращённое</span>
          <b className="tabular text-[15px] text-[var(--text)]">{money(Math.min(goodsValue, cap), cur)}</b>
        </div>
      )}
    </>
  );
}

/** «Как вернуть»: через monobank или с личных средств; банк возвращает только то, что прошло через него. */
function HowToRefund({ w }: { w: ReturnWizard }) {
  const { viaMono } = w.choice;
  const { cur, amountMinor, monoPossible, prepayScheme, monoLeft } = w.d!;
  return (
    <section className="flex flex-col gap-2">
      <div className="field-label">Как вернуть</div>
      {monoPossible ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            active={viaMono}
            onClick={() => w.setViaMono(true)}
            icon={<CreditCard className="h-4 w-4" />}
            label="Автоматически через monobank"
            sub="Банк вернёт на карту, с которой платили"
          />
          <ChoiceCard
            active={!viaMono}
            onClick={() => w.setViaMono(false)}
            icon={<Banknote className="h-4 w-4" />}
            label="С личных средств"
            sub="Переведёте сами, мы только запишем"
          />
        </div>
      ) : (
        <div className="card-2 flex items-start gap-2.5 px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
          <span>
            <b className="text-[var(--text)]">С личных средств.</b>{" "}
            {prepayScheme
              ? "Покупатель платил предоплатой и наложкой — через банк такое не вернуть. "
              : monoLeft > 0
                ? `Через monobank можно вернуть только до ${money(monoLeft, cur)}. `
                : "Оплата была не через monobank. "}
            Переведите покупателю {money(amountMinor, cur)} сами — мы запишем это в журнал.
          </span>
        </div>
      )}
    </section>
  );
}

export function StepMoney({ w, order }: { w: ReturnWizard; order: ReturnOrder }) {
  const { where, amount } = w.choice;
  const { cur, moneyOnly, amountMinor, errors } = w.d!;
  const compensation = where === "KEPT" && !moneyOnly;
  return (
    <div className="flex flex-col gap-3">
      <MoneyContext w={w} order={order} />

      <Input
        label={compensation ? `Компенсация, ${cur}` : `Сколько вернуть, ${cur}`}
        type="number"
        inputMode="decimal"
        value={amount}
        placeholder="0"
        onChange={(e) => w.typeAmount(e.target.value)}
        hint={amountHint(w.d!, where, (m) => money(m, cur))}
      />

      {amountMinor > 0 && <HowToRefund w={w} />}

      {errors.map((e) => (
        <p key={e} className="text-[12.5px] font-medium text-[var(--danger-ink)]">
          {e}
        </p>
      ))}
    </div>
  );
}
