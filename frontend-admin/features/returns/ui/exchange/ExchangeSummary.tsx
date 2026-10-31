"use client";

import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { ExchangeDraft } from "./use-exchange-draft";
import type { ReturnOrder } from "../../model/types";

export function ExchangeSummary({ d, order }: { d: ExchangeDraft; order: ReturnOrder }) {
  const cur = order.currency;
  return (
    <>
      {d.ready && (
        <div className="card-2 flex flex-col gap-1.5 px-3.5 py-3 text-[13px]">
          <div className="flex justify-between gap-2">
            <span className="text-[var(--text-muted)]">Новый заказ</span>
            <span className="tabular font-semibold text-[var(--text)]">{money(d.newValue, cur)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--text-muted)]">Зачёт за возвращённое</span>
            <span className="tabular font-semibold text-[var(--text)]">{money(d.credit, cur)}</span>
          </div>
          {d.due > 0 && (
            <p className="font-semibold text-[var(--accent-hi)]">
              Доплата {money(d.due, cur)} — покупатель выберет сам: онлайн в новом заказе через monobank (кнопка
              «Доплатить» у него в заказе) или наложкой при получении.
            </p>
          )}
          {d.over > 0 && (
            <p className="font-semibold text-[var(--accent-hi)]">
              Останется вернуть {money(d.over, cur)} — кнопка «Возврат» в этом заказе (или через monobank).
            </p>
          )}
          {d.due <= 0 && d.over <= 0 && <p className="text-[var(--text-muted)]">Без доплаты и возврата.</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="field-label">3. С чего начнётся новый заказ</div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["NEW", "В «Новые»"],
              ["APPROVED", "Сразу «Одобрен» (к отправке)"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => d.setTarget(v)}
              className={cn(
                "nb-chip nb-press h-9 px-3.5 text-[12.5px] transition-colors",
                d.target === v
                  ? "nb-chip-active"
                  : "text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-[var(--text-faint)]">
          Адрес и получатель — как в этом заказе; ТТН впишете при отправке нового.
        </p>
      </div>
    </>
  );
}
