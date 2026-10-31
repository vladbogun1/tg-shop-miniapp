import { num, uahShort } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { KpiTile } from "../../kit";

export function StockKpis({ k, deadDays, lowStockDays }: { k: Stock["kpis"]; deadDays: number; lowStockDays: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiTile label="Склад по рознице" value={uahShort(k.stockValueMinor)} hint={`${num(k.stockUnits)} шт. · ${num(k.liveProducts)} товаров на витрине`} />
      <KpiTile
        label="Дней запаса"
        value={k.daysOfCover == null ? "—" : `${Math.round(k.daysOfCover)} дн`}
        hint="Склад / продажи в день за последние 30 дней (в рознице)"
      />
      <KpiTile label={`Не продаётся ${deadDays}+ дн`} value={uahShort(k.deadStockMinor)} hint={`${num(k.deadStockProducts)} товаров — деньги лежат на полке`} />
      <KpiTile label={`Заканчиваются ≤ ${lowStockDays} дн`} value={num(k.runningOutProducts)} hint="Товары и варианты по скорости продаж" />
      <KpiTile label="Забытый сток" value={uahShort(k.forgottenMinor)} hint={`${num(k.forgottenProducts)} скрытых/архивных с остатком`} />
    </div>
  );
}
