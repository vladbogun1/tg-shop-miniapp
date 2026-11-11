"use client";

/** Части карточки «Отправки» для Новой Почты: галочка пакета и бейджи (стадия, «ТТН устарела», тип доставки, «при получении»). */
import { Badge } from "@/components/ui/Badge";
import { serviceLabel, ShipmentStageBadge } from "@/features/delivery";
import type { AdminDispatchOrder } from "@/features/order";
import { isStale } from "../model/batch";

export function TickBox({ o, ticked, onTick }: { o: AdminDispatchOrder; ticked: boolean; onTick: () => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center pointer-coarse:-m-2 pointer-coarse:p-2" title="Выбрать для «ТТН для всех» и печати">
      <input
        type="checkbox"
        checked={ticked}
        onChange={onTick}
        aria-label={`Выбрать заказ ${o.shortId}`}
        className="h-4 w-4 accent-[var(--accent)]"
      />
    </label>
  );
}

export function NpBadges({ o }: { o: AdminDispatchOrder }) {
  // Отделение — обычный случай, бейдж только для почтомата и курьера.
  const courierOrPostomat = !!o.npServiceType && o.npServiceType !== "WAREHOUSE";
  if (!o.shipmentStage && !isStale(o) && !courierOrPostomat && !o.paymentOnDelivery) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {o.shipmentStage && <ShipmentStageBadge stage={o.shipmentStage} />}
      {isStale(o) && <Badge tone="danger">ТТН устарела</Badge>}
      {courierOrPostomat && <Badge tone="neutral">{serviceLabel(o.npServiceType)}</Badge>}
      {o.paymentOnDelivery && <Badge tone="warn">при получении</Badge>}
    </div>
  );
}
