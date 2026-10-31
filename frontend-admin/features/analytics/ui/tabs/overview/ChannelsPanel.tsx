import { Split } from "lucide-react";
import { num, pct, uah, uahShort } from "../../../model/format";
import type { Overview } from "../../../model/types";
import { Panel, TableWrap } from "../../kit";

const SOURCE_LABEL: Record<string, string> = { MINIAPP: "Mini App", WEB: "Сайт", ADMIN: "Админка" };

export function ChannelsPanel({ channels }: { channels: Overview["channels"] }) {
  return (
    <Panel title="Mini App и сайт" icon={Split} hint="Сравнение каналов за период (фильтр канала здесь не действует)">
      <TableWrap>
        <table className="mx-table">
          <thead>
            <tr>
              <th>Канал</th>
              <th className="r">Заказы</th>
              <th className="r">Продано</th>
              <th className="r">Чек</th>
              <th className="r">Отказы</th>
              <th className="r">Конверсия</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.source}>
                <td className="font-semibold">{SOURCE_LABEL[c.source] ?? c.source}</td>
                <td className="r">{num(c.orders)}</td>
                <td className="r">{uahShort(c.soldMinor)}</td>
                <td className="r">{uah(c.aovMinor)}</td>
                <td className="r">{pct(c.rejectRatePct)}</td>
                <td className="r" title={c.visitors != null ? `${num(c.buyers)} покупателей из ${num(c.visitors)} посетителей` : undefined}>
                  {c.conversionPct != null ? pct(c.conversionPct) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="mt-2 text-[11px] text-[var(--text-faint)]">
        Конверсия = покупатели / уникальные посетители. Видна, когда журнал событий покрывает весь период
        (события Mini App хранятся с сентября, сайта — с выхода этой версии).
      </p>
    </Panel>
  );
}
