"use client";

import type { ReactNode } from "react";
import { CircleCheck, Clock, CreditCard, Truck } from "lucide-react";

/**
 * Справка рядом со способами: правила, общие для всех. На ноутбуке открывается кнопкой «Как это работает»,
 * на очень широком экране (≥ 1536) стоит колонкой справа. Тексты — из старого кода целиком.
 */
export function HowItWorks() {
  const steps: { icon: typeof Clock; text: ReactNode }[] = [
    {
      icon: CreditCard,
      text: <>После оформления покупатель попадает на страницу monobank: карта, Apple Pay, Google Pay или приложение mono.</>,
    },
    {
      icon: Clock,
      text: (
        <>
          На оплату — <b className="text-[var(--text)]">24 часа</b>. Не оплатил — заказ отменяется сам (причина
          «Не оплатил за сутки»), товар возвращается на склад.
        </>
      ),
    },
    {
      icon: CircleCheck,
      text: (
        <>
          Оплаченный заказ остаётся <b className="text-[var(--text)]">«Новым»</b> — одобряете вы. Нет товара —
          «Вернуть деньги» в карточке заказа.
        </>
      ),
    },
    {
      icon: Truck,
      text: <>При предоплате остаток покупатель платит наложкой на почте.</>,
    },
  ];
  return (
    <section className="panel h-fit min-w-0 p-4 sm:p-5">
      <h2 className="section-title mb-3 !text-[15px] text-[var(--ink)]">Как работает оплата</h2>
      <ul className="flex flex-col gap-3">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--text-muted)]">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
