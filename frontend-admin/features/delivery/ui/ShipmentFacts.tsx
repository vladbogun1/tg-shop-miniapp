"use client";

import { money } from "@shop/core/money";
import { formatDateTime } from "@shop/core/time";
import { boxText, dayText, weightText } from "../model/format";
import type { Shipment } from "../model/types";

function factsOf(s: Shipment, currency: string): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (s.weightG) facts.push({ label: "Вес", value: weightText(s.weightG) });
  if (s.lengthMm && s.widthMm && s.heightMm) facts.push({ label: "Коробка", value: boxText(s.lengthMm, s.widthMm, s.heightMm) });
  facts.push({ label: "Наложка", value: s.codMinor > 0 ? money(s.codMinor, currency) : "нет" });
  if (s.deliveryCostMinor != null) facts.push({ label: "Доставка", value: money(s.deliveryCostMinor, currency) });
  if (s.scheduledDelivery) facts.push({ label: "Ожидается", value: dayText(s.scheduledDelivery) });
  if (s.arrivedAt) facts.push({ label: "Прибыла", value: formatDateTime(s.arrivedAt) });
  if (s.storagePaidFrom) facts.push({ label: "Платное хранение с", value: dayText(s.storagePaidFrom) });
  if (s.returnTtn) facts.push({ label: "ТТН возврата", value: s.returnTtn });
  return facts;
}

/** Вес, коробка, наложка, цена доставки и даты — только то, что известно. */
export function ShipmentFacts({ s, currency }: { s: Shipment; currency: string }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
      {factsOf(s, currency).map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="field-label !text-[10.5px] !text-[var(--text-faint)]">{f.label}</dt>
          <dd className="tabular break-words font-semibold text-[var(--text)]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
