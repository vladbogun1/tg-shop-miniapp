"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { CircleCheck, Clock, CreditCard, Truck } from "lucide-react";
import { ease } from "@/lib/motion";

/** Static explainer next to the options: the rules every option follows. */
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
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ease, delay: 0.06 }}
      className="panel h-fit min-w-0 p-5"
    >
      <h2 className="section-title mb-3 !text-[15px] text-[var(--ink)]">Как работает оплата</h2>
      <ul className="flex flex-col gap-3">
        {steps.map(({ icon: Icon, text }, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px] leading-snug text-[var(--text-muted)]">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}
