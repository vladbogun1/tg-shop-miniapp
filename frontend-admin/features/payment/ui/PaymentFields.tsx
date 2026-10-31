"use client";

import type { ReactNode } from "react";
import type { ShopForm } from "@shop/ui/form";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { PAID_CHANNELS, type MovementChannel } from "../model/movements";
import type { PaymentMode } from "../model/amounts";
import type { PaymentOrder } from "../model/types";

export interface PaymentValues {
  mode: PaymentMode | null;
  custom: string;
  channel: MovementChannel;
  note: string;
}

/** Тело модалки «Корректировка оплаты»: выбор суммы, канал, заметка, подсказки по наложке. */
export function PaymentFields({
  form,
  order,
  opt,
  customMinor,
  valid,
  codAfter,
  confirmFull,
}: {
  form: ShopForm<PaymentValues>;
  order: PaymentOrder;
  /** Радио-кнопка способа (общая для подтверждения «Полная оплата»). */
  opt: (m: PaymentMode, label: string, sub?: string) => ReactNode;
  customMinor: number;
  valid: boolean;
  codAfter: number;
  confirmFull: boolean;
}) {
  const { mode, channel } = form.watch();
  const cur = order.currency;
  const hasPrepay = order.prepaymentMinor > 0;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
        Онлайн-оплаты monobank засчитываются сами. Здесь — ручная правка: получили наложку, нужно
        исправить сумму. Деньги покупателю отсюда не возвращаются — для этого «Вернуть деньги» в блоке
        «Онлайн-оплата».
      </p>
      <p className="text-[13px] text-[var(--text-muted)]">
        Сколько фактически получено от клиента? Наложка = сумма заказа ({money(order.totalMinor, cur)}) −
        полученное.
      </p>
      {hasPrepay && opt("prepayment", "Предоплата", money(order.prepaymentMinor, cur))}
      {opt("full", "Полная оплата", money(order.totalMinor, cur))}
      {opt("custom", "Другая сумма")}
      {mode === "custom" && (
        <Input
          label={`Сумма, ${cur}`}
          type="number"
          inputMode="decimal"
          autoFocus
          {...form.register("custom")}
          placeholder="0"
          error={customMinor > order.totalMinor ? "Больше суммы заказа" : undefined}
        />
      )}
      {mode !== null && (
        <div className="flex flex-col gap-2">
          <div className="field-label">Как получили</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PAID_CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => form.setValue("channel", c.value)}
                aria-pressed={channel === c.value}
                className={cn(
                  "nb-press min-h-10 rounded-[var(--r-md)] border px-3 py-2 text-left text-[12.5px] font-medium leading-tight transition-colors",
                  channel === c.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)]"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Input label="Заметка (в журнал денег)" maxLength={500} {...form.register("note")} />
        </div>
      )}
      {confirmFull ? (
        <p className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-[13px] font-semibold text-[var(--danger-ink)]">
          Точно получена вся сумма {money(order.totalMinor, cur)}? Наложка станет 0 — посылка уйдёт без
          наложки.
        </p>
      ) : (
        valid && (
          <p className="text-[12px] text-[var(--text-muted)]">
            Наложка после сохранения: <b className="tabular font-semibold text-[var(--text)]">{money(codAfter, cur)}</b>
          </p>
        )
      )}
      {order.receivedMinor > 0 && (
        <p className="text-[12px] text-[var(--text-muted)]">
          Сейчас получено: <b className="tabular font-semibold text-[var(--text)]">{money(order.receivedMinor, cur)}</b>
        </p>
      )}
    </div>
  );
}
