import { Shapes } from "lucide-react";
import { formatNumber } from "@shop/core/money";
import { num, pct, uahShort } from "../../../model/format";
import type { Overview } from "../../../model/types";
import { Empty, Panel } from "../../kit";
import { RankBars } from "../../charts";

export function CategoriesPanel({ categories }: { categories: Overview["categories"] }) {
  return (
    <Panel
      title="Категории"
      icon={Shapes}
      hint="Выручка после скидок, без отказов и подарков. По корневой категории товара; без категории — отдельной строкой."
    >
      {categories.filter((c) => c.revenueMinor > 0).length === 0 ? (
        <Empty>Продаж за период нет</Empty>
      ) : (
        <RankBars
          rows={categories.filter((c) => c.revenueMinor > 0).map((c) => ({ key: c.name, label: c.name, value: c.revenueMinor }))}
          format={uahShort}
          sub={(name) => {
            const c = categories.find((x) => x.name === name)!;
            return `${pct(c.sharePct)} выручки · ${num(c.units)} шт. · ${num(c.liveProducts)} товаров на витрине · ${formatNumber(c.unitsPerProduct, "ru-RU")} шт. на товар`;
          }}
        />
      )}
      {categories.some((c) => c.revenueMinor === 0 && c.liveProducts > 0) && (
        <div className="mt-3 text-[12px] text-[var(--text-muted)]">
          Без продаж за период:{" "}
          {categories
            .filter((c) => c.revenueMinor === 0 && c.liveProducts > 0)
            .map((c) => `${c.name} (${c.liveProducts})`)
            .join(", ")}
        </div>
      )}
    </Panel>
  );
}
