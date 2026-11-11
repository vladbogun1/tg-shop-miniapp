"use client";

/** «Для какой доставки»: чипы четырёх доставок; хотя бы одна остаётся включённой. */
import { Chip } from "@/features/delivery";
import { DELIVERY_KINDS, ALL_DELIVERIES, toggleDelivery, type DeliveryKind } from "../model/deliveries";

export function DeliveryPicker({ value, onChange }: { value: DeliveryKind[]; onChange: (v: DeliveryKind[]) => void }) {
  const all = value.length >= ALL_DELIVERIES.length;
  return (
    <div className="min-w-0" role="group" aria-label="Для какой доставки">
      <div className="field-label mb-1.5">Для какой доставки</div>
      <div className="flex flex-wrap gap-2">
        {DELIVERY_KINDS.map((d) => (
          <Chip key={d.value} active={value.includes(d.value)} onClick={() => onChange(toggleDelivery(value, d.value))}>
            {d.label}
          </Chip>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-[var(--text-faint)]">
        {all ? "Показывается при любой доставке." : "Покупатель увидит способ только при выбранной доставке."}
      </p>
    </div>
  );
}
