import { Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { num, uahShort } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { Empty, InlineBar, Panel, TableWrap } from "../../kit";
import { editHref } from "./shared";

export function TopProductsPanel({ products }: { products: Stock["topProducts"] }) {
  const [topBy, setTopBy] = useState<"revenue" | "units">("revenue");
  const top = [...products]
    .sort((a, b) => (topBy === "revenue" ? b.revenueMinor - a.revenueMinor : b.units - a.units))
    .slice(0, 15);
  const topMax = Math.max(1, ...top.map((t) => (topBy === "revenue" ? t.revenueMinor : t.units)));
  return (
    <Panel
      title="Топ товаров"
      icon={Trophy}
      hint="За выбранный период, по товару (а не по названию), без отказов и подарков; выручка после скидок"
      actions={
        <SegmentedControl
          size="sm"
          options={[
            { value: "revenue", label: "₴" },
            { value: "units", label: "шт." },
          ]}
          value={topBy}
          onChange={setTopBy}
        />
      }
    >
      {top.length === 0 ? (
        <Empty>Продаж за период нет</Empty>
      ) : (
        <TableWrap>
          <table className="mx-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th className="w-[30%]" />
                <th className="r">{topBy === "revenue" ? "Выручка" : "Шт."}</th>
                <th className="r">{topBy === "revenue" ? "Шт." : "Выручка"}</th>
                <th className="r">Остаток</th>
              </tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.productId}>
                  <td>
                    <Link href={editHref(t.productId)} className="font-semibold hover:underline">
                      {t.title}
                    </Link>
                    {!t.live && <span className="ml-1 text-[11px] text-[var(--text-faint)]">(скрыт)</span>}
                  </td>
                  <td>
                    <InlineBar value={topBy === "revenue" ? t.revenueMinor : t.units} max={topMax} />
                  </td>
                  <td className="r font-semibold">{topBy === "revenue" ? uahShort(t.revenueMinor) : num(t.units)}</td>
                  <td className="r text-[var(--text-muted)]">{topBy === "revenue" ? num(t.units) : uahShort(t.revenueMinor)}</td>
                  <td className="r">{num(t.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Panel>
  );
}
