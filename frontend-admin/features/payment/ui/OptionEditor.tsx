"use client";

import { CreditCard, Trash2, Truck } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { money } from "@/lib/money";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { isOnDelivery, prepayMinor, type OptionRow } from "../model/options";
import { DeliveryPicker } from "./DeliveryPicker";

/** Строка под способом: что покупатель платит онлайн и что остаётся для почты. */
function OptionSummary({ row }: { row: OptionRow }) {
  const pre = prepayMinor(row);
  if (isOnDelivery(row)) {
    return (
      <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
        <Truck className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>Вся сумма — при получении на Новой Почте. Включается и ограничивается в настройках Новой Почты.</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
      {row.requiresPrepayment ? (
        <>
          <Truck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Онлайн сейчас: <b className="tabular font-semibold text-[var(--text)]">{pre > 0 ? money(pre) : "—"}</b>,
            остаток — наложкой при получении.
          </span>
        </>
      ) : (
        <>
          <CreditCard className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>Вся сумма заказа онлайн через monobank.</span>
        </>
      )}
    </p>
  );
}

/**
 * Поля одного способа оплаты: название, описание для покупателя, предоплата, удаление.
 * На ноутбуке раскрывается в строке, на телефоне лежит в шторке (`inSheet`: там же «Показывать покупателям» и «Готово»).
 */
export function OptionEditor({
  o,
  inSheet,
  onPatch,
  onRemove,
  onDone,
}: {
  o: OptionRow;
  inSheet?: boolean;
  onPatch: (patch: Partial<OptionRow>) => void;
  onRemove: () => void;
  onDone?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Input label="Название" className="max-w-full" value={o.title} autoFocus={!o.id} onChange={(e) => onPatch({ title: e.target.value })} />
        <Input
          label="Описание для покупателя"
          className="max-w-full"
          value={o.description}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
      </div>
      <div className={isOnDelivery(o) ? "hidden" : "flex flex-wrap items-end justify-between gap-3"}>
        <Toggle checked={o.requiresPrepayment} onChange={(v) => onPatch({ requiresPrepayment: v })} label="Предоплата + наложка" />
        {o.requiresPrepayment && (
          <Input
            label="Предоплата онлайн, ₴"
            inputMode="decimal"
            className="max-w-full"
            value={o.prepaymentMajor}
            error={o.title.trim() && prepayMinor(o) <= 0 ? "Укажите сумму" : undefined}
            onChange={(e) => onPatch({ prepaymentMajor: e.target.value })}
          />
        )}
      </div>
      <OptionSummary row={o} />
      <DeliveryPicker value={o.deliveries} onChange={(deliveries) => onPatch({ deliveries })} />
      {inSheet && <Toggle checked={o.active} onChange={(v) => onPatch({ active: v })} label="Показывать покупателям" />}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={onRemove} className="hover:text-[var(--danger-ink)]">
          Удалить
        </Button>
        {onDone && (
          <Button variant="accent" onClick={onDone} className={inSheet ? "min-w-32" : undefined}>
            Готово
          </Button>
        )}
      </div>
    </div>
  );
}
