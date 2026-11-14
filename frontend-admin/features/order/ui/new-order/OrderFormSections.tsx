"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { CHANNEL_OPTIONS, DELIVERY_OPTIONS, isLatinName, type Delivery, type NewOrderValues, type PaidChannel } from "../../model/new-order";
import { NpAddressFields, type HouseInput } from "../modals/NpAddressFields";

interface SectionProps {
  values: NewOrderValues;
  onChange: (patch: Partial<NewOrderValues>) => void;
}

export function CustomerSection({ values: v, onChange }: SectionProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input label="Имя покупателя" value={v.name} onChange={(e) => onChange({ name: e.target.value })} autoComplete="off" />
      <Input label="Телефон" inputMode="tel" value={v.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="+380…" autoComplete="off" />
      <Input
        label="Telegram id покупателя (необязательно)"
        inputMode="numeric"
        value={v.tgId}
        onChange={(e) => onChange({ tgId: e.target.value.replace(/\D/g, "").slice(0, 18) })}
        placeholder="если он уже писал боту"
        hint="Заказ появится в кабинете этого аккаунта — проверьте id"
      />
      <Input label="Промокод" value={v.promo} onChange={(e) => onChange({ promo: e.target.value })} autoComplete="off" />
      <div className="sm:col-span-2">
        <Textarea label="Комментарий к заказу" rows={2} value={v.comment} onChange={(e) => onChange({ comment: e.target.value })} />
      </div>
    </section>
  );
}

export function DeliverySection({
  values: v,
  onChange,
  onDelivery,
  legacyAddress,
}: SectionProps & { onDelivery: (d: Delivery) => void; legacyAddress: string | null }) {
  const houseInput: HouseInput = (field) => ({
    value: v[field],
    onChange: (e) => onChange(field === "building" ? { building: e.target.value } : { flat: e.target.value }),
  });
  const nova = v.delivery === "NOVA_POSHTA";
  return (
    <section className="flex flex-col gap-3">
      <span className="field-label">Доставка</span>
      <SegmentedControl options={DELIVERY_OPTIONS} value={v.delivery} onChange={onDelivery} className="h-10" />
      {nova && legacyAddress && !v.city && (
        <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] leading-snug text-[var(--text-muted)]">
          В прошлом заказе адрес записан текстом: <span className="font-semibold text-[var(--text)]">{legacyAddress}</span>. Выберите город и
          отделение из справочника ниже.
        </p>
      )}
      {nova && <NpAddressFields value={v} onChange={onChange} houseInput={houseInput} />}
      {nova && isLatinName(v.name) && (
        <p className="text-[12px] text-[var(--danger-ink)]">Имя латиницей — Новая почта не создаст ТТН. Напишите имя кириллицей.</p>
      )}
    </section>
  );
}

export function PaymentSection({
  values: v,
  onChange,
  paymentOptions,
}: SectionProps & { paymentOptions: { value: string; label: string }[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Select
          label="Способ оплаты"
          value={v.paymentId}
          options={paymentOptions}
          onChange={(id) => onChange({ paymentId: id })}
          placeholder="Выберите способ оплаты…"
        />
      </div>
      <Input
        label="Уже получено, ₴"
        inputMode="decimal"
        value={v.paidText}
        onChange={(e) => onChange({ paidText: e.target.value.replace(/[^\d.,]/g, "").slice(0, 10) })}
        placeholder="0 — ещё не платил"
      />
      <Select
        label="Как получили"
        value={v.channel}
        options={CHANNEL_OPTIONS}
        onChange={(c: PaidChannel) => onChange({ channel: c, channelTouched: true })}
      />
      <div className="sm:col-span-2">
        <Input label="Заметка (для себя)" value={v.note} onChange={(e) => onChange({ note: e.target.value })} />
      </div>
    </section>
  );
}
