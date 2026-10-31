import { Warehouse } from "lucide-react";
import { num, uahShort } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { Panel, StatusChip, TableWrap } from "../../kit";

export function CategoriesStockPanel({ categories }: { categories: Stock["categories"] }) {
  return (
    <Panel title="Склад по категориям" icon={Warehouse} hint="Остаток по розничной цене и на сколько дней его хватит при темпе последних 30 дней">
      <TableWrap>
        <table className="mx-table">
          <thead>
            <tr>
              <th>Категория</th>
              <th className="r">Товаров</th>
              <th className="r">Шт.</th>
              <th className="r">На сумму</th>
              <th className="r">Дней запаса</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.name}>
                <td className="font-semibold">{c.name}</td>
                <td className="r">{num(c.products)}</td>
                <td className="r">{num(c.units)}</td>
                <td className="r">{uahShort(c.valueMinor)}</td>
                <td className="r">
                  {c.daysOfCover == null ? (
                    <span className="text-[var(--text-faint)]">не продаётся</span>
                  ) : c.daysOfCover > 180 ? (
                    <StatusChip tone="warn">◐ {num(Math.round(c.daysOfCover))}</StatusChip>
                  ) : (
                    num(Math.round(c.daysOfCover))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Panel>
  );
}
