import { PackageSearch } from "lucide-react";
import Link from "next/link";
import { num } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { Empty, Panel, StatusChip, TableWrap, useLimited } from "../../kit";
import { editHref } from "./shared";

export function DemandPanel({ s }: { s: Stock }) {
  const demandRows = useLimited(s.reorder.missedDemand, 8);
  return (
  <Panel
    title="Спрос есть, товара нет"
    icon={PackageSearch}
    hint="Закончились или скрыты, но их смотрят и кладут в корзину (30 дней) или недавно покупали (90 дней) — кандидаты вернуть в продажу."
  >
    {s.reorder.missedDemand.length === 0 ? (
      <Empty>Таких товаров нет</Empty>
    ) : (
      <>
      <TableWrap>
        <table className="mx-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Статус</th>
              <th className="r">Смотрели</th>
              <th className="r">В корзину</th>
              <th className="r">Продано 90 дн</th>
              <th className="r">Последняя продажа</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {demandRows.visible.map((d) => (
              <tr key={d.productId}>
                <td className="font-semibold">{d.title}</td>
                <td>{d.live ? <StatusChip tone="warn">◐ нет на складе</StatusChip> : <StatusChip tone="muted">○ скрыт</StatusChip>}</td>
                <td className="r" title={`${num(d.views30)} просмотров`}>
                  {num(d.viewers30)} чел.
                </td>
                <td className="r">{num(d.cartAdds30)}</td>
                <td className="r">{num(d.sold90)}</td>
                <td className="r">{d.lastSoldDaysAgo == null ? "—" : `${num(d.lastSoldDaysAgo)} дн назад`}</td>
                <td className="r">
                  <Link href={editHref(d.productId)} className="text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {demandRows.toggle}
      </>
    )}
  </Panel>
  );
}
