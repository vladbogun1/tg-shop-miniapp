import { Gift } from "lucide-react";
import { num, uah } from "../../../model/format";
import type { Overview } from "../../../model/types";
import { Panel } from "../../kit";
import { Row } from "./Row";

export function GiveawaysPanel({ giveaways }: { giveaways: Overview["giveaways"] }) {
  return (
    <Panel title="Отданная выручка" icon={Gift} hint="Сколько денег ушло на скидки и подарки за период">
      <div className="flex flex-col gap-3 text-[13px]">
        <Row label="Скидки (промокоды и ручные)" value={uah(giveaways.discountMinor)} sub={`${num(giveaways.promoOrders)} заказов со скидкой`} />
        <Row
          label="Подарки (по розничной цене)"
          value={uah(giveaways.giftValueMinor)}
          sub={`${num(giveaways.giftUnits)} шт.`}
        />
        <div className="border-t border-[var(--line)] pt-2">
          <Row label="Итого отдано" value={uah(giveaways.discountMinor + giveaways.giftValueMinor)} />
        </div>
      </div>
    </Panel>
  );
}
