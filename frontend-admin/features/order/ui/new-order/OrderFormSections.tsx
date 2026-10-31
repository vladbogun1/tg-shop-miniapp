"use client";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { CHANNEL_OPTIONS, DELIVERY_OPTIONS, type Delivery, type NewOrderValues, type PaidChannel } from "../../model/new-order";

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
      />
      <Input label="Промокод" value={v.promo} onChange={(e) => onChange({ promo: e.target.value })} autoComplete="off" />
      <div className="sm:col-span-2">
        <Textarea label="Комментарий к заказу" rows={2} value={v.comment} onChange={(e) => onChange({ comment: e.target.value })} />
      </div>
    </section>
  );
}

export function DeliverySection({ values: v, onChange, onDelivery }: SectionProps & { onDelivery: (d: Delivery) => void }) {
  return (
    <section className="flex flex-col gap-3">
      <span className="field-label">Доставка</span>
      <SegmentedControl options={DELIVERY_OPTIONS} value={v.delivery} onChange={onDelivery} className="h-10" />
      {v.delivery === "NOVA_POSHTA" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Город" value={v.city} onChange={(e) => onChange({ city: e.target.value })} />
          <Input label="Отделение" value={v.warehouse} onChange={(e) => onChange({ warehouse: e.target.value })} />
        </div>
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
