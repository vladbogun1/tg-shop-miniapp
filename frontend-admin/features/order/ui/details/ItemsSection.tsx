"use client";

/** «Состав»: позиции, приз кейса, итоги и кнопки правки заказа. */
import type { AdminOrderDetail } from "../../api";
import type { DetailHandlers } from "./types";
import { CaseGiftNotes } from "./CaseGiftNotes";
import { ItemsActions } from "./ItemsActions";
import { OrderItemRow } from "./OrderItemRow";
import { Section } from "./section";
import { TotalsBlock } from "./TotalsBlock";

export function ItemsSection({ order, h }: { order: AdminOrderDetail; h: DetailHandlers }) {
  return (
    <Section title="Состав">
      <div className="flex flex-col gap-3">
        {order.items.map((it, i) => (
          <OrderItemRow key={it.id ?? i} it={it} order={order} h={h} />
        ))}
        <CaseGiftNotes order={order} />
      </div>
      <TotalsBlock order={order} />
      <ItemsActions order={order} h={h} />
    </Section>
  );
}
