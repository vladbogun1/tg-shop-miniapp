"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { CURRENCIES, useSuppliers } from "@/features/procurement";
import type { DraftEdit, SupplierPick } from "./use-draft-edit";

/** Шапка будущей поставки: название, поставщик (из списка или новый по названию из накладной), валюта, курс, срок. */
export function DraftHeadForm({ edit, docSupplier }: { edit: DraftEdit; docSupplier: string | null }) {
  const suppliers = useSuppliers().data ?? [];
  const h = edit.head;
  const options: { value: SupplierPick; label: string }[] = [
    { value: "none", label: "Без поставщика" },
    ...suppliers.map((s) => ({ value: String(s.id) as SupplierPick, label: s.name })),
    { value: "new", label: "Новый поставщик…" },
  ];
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Input label="Название поставки" value={h.title} placeholder="Поставка с ИИ" onChange={(e) => edit.setHead({ title: e.target.value })} />
      <Select
        label="Поставщик"
        value={h.supplier}
        options={options}
        onChange={(v) => edit.setHead(v === "new" && !h.supplierName ? { supplier: v, supplierName: docSupplier ?? "" } : { supplier: v })}
      />
      {h.supplier === "new" && (
        <Input
          label="Название нового поставщика"
          value={h.supplierName}
          hint="Заведётся при «Принять»; если такой уже есть — возьмём его"
          onChange={(e) => edit.setHead({ supplierName: e.target.value })}
        />
      )}
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <Select label="Валюта накладной" value={h.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(v) => edit.setHead({ currency: v })} />
        <Input label="Курс к ₴" inputMode="decimal" value={h.fxRate} onChange={(e) => edit.setHead({ fxRate: e.target.value })} />
      </div>
      <Input label="Едет, недель" inputMode="numeric" value={h.etaWeeks} hint="Срок для покупателей, 0–52" onChange={(e) => edit.setHead({ etaWeeks: e.target.value })} />
      <div className="flex min-w-0 items-end pb-2">
        <Toggle checked={h.preorderOpen} onChange={(v) => edit.setHead({ preorderOpen: v })} label="Можно заказать заранее" />
      </div>
    </div>
  );
}
