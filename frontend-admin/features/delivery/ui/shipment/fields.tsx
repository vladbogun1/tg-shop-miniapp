"use client";

/** Поля окна ТТН. Каждое получает форму и `set` с частью формы. */
import { Loader2 } from "lucide-react";
import { money } from "@shop/core/money";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { boxText, cmText, intText, weightText } from "../../model/format";
import { documentsOffered, presetMatches, type ShipmentForm } from "../../model/shipment-form";
import type { BoxPreset, SenderWarehouse, ShipmentPreview } from "../../model/types";
import { Chip, Notice } from "../parts";

/** Правка части формы. */
export type SetForm = (patch: Partial<ShipmentForm>) => void;

type FieldProps = { form: ShipmentForm; set: SetForm };

/** НП нужны фамилия, имя и отчество отдельно. */
export function RecipientFields({ form, set }: FieldProps) {
  return (
    <div>
      <div className="field-label mb-1.5">Получатель</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input aria-label="Фамилия" placeholder="Фамилия" autoComplete="off" value={form.last} onChange={(e) => set({ last: e.target.value })} />
        <Input aria-label="Имя" placeholder="Имя" autoComplete="off" value={form.first} onChange={(e) => set({ first: e.target.value })} />
        <Input
          aria-label="Отчество"
          placeholder="Отчество (если есть)"
          autoComplete="off"
          value={form.middle}
          onChange={(e) => set({ middle: e.target.value })}
        />
      </div>
    </div>
  );
}

export function SenderChips({ form, set, warehouses }: FieldProps & { warehouses: SenderWarehouse[] }) {
  if (warehouses.length === 0) {
    return <Notice tone="warn">Отделение отправки не выбрано — настройте отправителя в «Настройки → Доставка → ТТН и отправитель».</Notice>;
  }
  return (
    <div className="min-w-0">
      <div className="field-label mb-1.5">Отделение отправки</div>
      <div className="flex flex-wrap gap-2">
        {warehouses.map((w) => (
          <Chip key={w.ref} active={form.sender === w.ref} onClick={() => set({ sender: w.ref })}>
            №{w.number}
            <span className="ml-1.5 font-normal opacity-80">{w.description}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}

function PresetChips({ form, set, initial, presets }: FieldProps & { initial: ShipmentPreview; presets: BoxPreset[] }) {
  const parcel = initial.parcel;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Chip onClick={() => set({ weight: intText(parcel.weightG), l: cmText(parcel.lengthMm), w: cmText(parcel.widthMm), h: cmText(parcel.heightMm) })}>
        Авто · {boxText(parcel.lengthMm, parcel.widthMm, parcel.heightMm)}
      </Chip>
      {presets.map((pr) => (
        <Chip key={pr.name} active={presetMatches(form, pr)} onClick={() => set({ l: cmText(pr.lengthMm), w: cmText(pr.widthMm), h: cmText(pr.heightMm) })}>
          {pr.name} · {boxText(pr.lengthMm, pr.widthMm, pr.heightMm)}
          {pr.packMinor ? ` · ${money(pr.packMinor)}` : ""}
        </Chip>
      ))}
      {parcel.source && <span className="text-[11.5px] text-[var(--text-faint)]">размер взят: {parcel.source}</span>}
    </div>
  );
}

function Seats({ initial }: { initial: ShipmentPreview }) {
  const seats = initial.parcel.seats ?? [];
  if (seats.length <= 1) return null;
  return (
    <ul className="flex min-w-0 flex-col gap-1 text-[12px] text-[var(--text-muted)]">
      {seats.map((s, i) => (
        <li key={i} className="min-w-0 break-words">
          Место {i + 1}: {s.box ?? "своя упаковка"} · {boxText(s.lengthMm, s.widthMm, s.heightMm)} · {weightText(s.weightG)}
        </li>
      ))}
    </ul>
  );
}

export function ParcelFields({ form, set, initial, presets, boxError }: FieldProps & { initial: ShipmentPreview; presets: BoxPreset[]; boxError?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)]">
        <Input
          label="Вес, г"
          inputMode="numeric"
          value={form.weight}
          onChange={(e) => set({ weight: e.target.value.replace(/[^\d]/g, "") })}
          hint={form.weight ? weightText(Number(form.weight)) : "Пусто — по товарам"}
        />
        <div className="min-w-0">
          <div className="field-label mb-1.5">Коробка, см (Д × Ш × В)</div>
          <div className="grid grid-cols-3 gap-2">
            <Input aria-label="Длина, см" inputMode="decimal" placeholder="Д" value={form.l} onChange={(e) => set({ l: e.target.value })} />
            <Input aria-label="Ширина, см" inputMode="decimal" placeholder="Ш" value={form.w} onChange={(e) => set({ w: e.target.value })} />
            <Input aria-label="Высота, см" inputMode="decimal" placeholder="В" value={form.h} onChange={(e) => set({ h: e.target.value })} />
          </div>
          {boxError && <span className="mt-1 block text-[12px] text-[var(--danger-ink)]">{boxError}</span>}
        </div>
      </div>
      <PresetChips form={form} set={set} initial={initial} presets={presets} />
      <Seats initial={initial} />
    </div>
  );
}

export function MoneyFields({ form, set }: FieldProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label="Объявленная стоимость, ₴"
        inputMode="decimal"
        value={form.declared}
        onChange={(e) => set({ declared: e.target.value })}
        hint="Пусто — сумма заказа"
      />
      <Input label="Дата отправки" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
    </div>
  );
}

export function CodAndDocuments({ form, set, p }: FieldProps & { p: ShipmentPreview }) {
  return (
    <>
      <div className="card-2 flex min-w-0 flex-col gap-2 px-3.5 py-3">
        <Toggle checked={form.collectCod} onChange={(v) => set({ collectCod: v })} label="Контроль оплати (наложка)" />
        <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
          {form.collectCod ? (
            <>
              НП соберёт с получателя <b className="tabular font-semibold text-[var(--text)]">{money(p.codMinor)}</b>
              {p.codMinor === 0 && " — заказ уже оплачен, наложки нет"}
            </>
          ) : (
            "Деньги при получении не берём (оплачено другим способом)."
          )}
        </p>
      </div>
      {documentsOffered(form, p) && (
        <div className="card-2 flex min-w-0 flex-col gap-2 px-3.5 py-3">
          <Toggle checked={form.documents} onChange={(v) => set({ documents: v })} label="Отправить как «Документи»" />
          <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">Дешевле посылки для плоского и лёгкого (глайды, рукава): одно место до 1 кг.</p>
        </div>
      )}
    </>
  );
}

export function Estimate({ form, p, loading }: { form: ShipmentForm; p: ShipmentPreview; loading: boolean }) {
  const pack = p.parcel.packMinor ?? 0;
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-[var(--line)] pt-3 text-[13px] text-[var(--text-muted)]">
      <span>
        Доставка ≈ <b className="tabular font-semibold text-[var(--text)]">{p.estimateMinor != null ? money(p.estimateMinor) : "—"}</b>
        {p.estimateMinor != null && pack > 0 && <span className="ml-1 text-[12px]">(с упаковкой {money(pack)})</span>}
      </span>
      {form.collectCod && (
        <span>
          {p.codFeeMinor != null ? (
            <>
              Комиссия за наложку ≈ <b className="tabular font-semibold text-[var(--text)]">{money(p.codFeeMinor)}</b>
            </>
          ) : (
            "комиссия за наложку — по договору с НП"
          )}
        </span>
      )}
      {p.payer && <span>Платит: {p.payer}</span>}
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Пересчитываем" />}
    </div>
  );
}

/** Онлайн-оплата не пришла: создать ТТН — только осознанно. */
export function UnpaidCheck({ checked, onChange, dueText }: { checked: boolean; onChange: (v: boolean) => void; dueText: string | null }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3.5 py-3 text-[13px]">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <b className="font-semibold text-[var(--danger-ink)]">Создать для неоплаченного</b>
        <span className="mt-0.5 block text-[var(--text-muted)]">
          Онлайн-оплата не пришла{dueText ? ` (не хватает ${dueText})` : ""}. Отметьте, только если договорились с покупателем (например, в
          чате).
        </span>
      </span>
    </label>
  );
}
