import { Wallet } from "lucide-react";
import { num, uah, uahShort } from "../../../model/format";
import type { SchemeRow } from "../../../model/types";
import { Empty, Panel, TableWrap } from "../../kit";

export function SchemesPanel({ rows }: { rows: SchemeRow[] }) {
  return (
    <Panel
      title="Способы оплаты: старые и онлайн"
      icon={Wallet}
      hint="Перевод на карту — заказы до 07.10.2026 (v3.9.0), онлайн — через monobank. Заказы и продано — по дате оформления, получено — по дате поступления денег."
    >
      {rows.length === 0 ? (
        <Empty>Заказов за период нет</Empty>
      ) : (
        <TableWrap>
          <table className="mx-table">
            <thead>
              <tr>
                <th>Способ</th>
                <th className="r">Заказы</th>
                <th className="r">Продано</th>
                <th className="r">Чек</th>
                <th className="r">Получено</th>
                <th className="r">Отказы</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className={r.online ? "font-semibold" : undefined}>{r.label}</td>
                  <td className="r">{num(r.orders)}</td>
                  <td className="r">{uahShort(r.soldMinor)}</td>
                  <td className="r">{r.orders > 0 ? uah(r.aovMinor) : "—"}</td>
                  <td className="r">{uahShort(r.receivedMinor)}</td>
                  <td
                    className="r"
                    title={r.online ? `${num(r.timedOut)} — автоотмена за неоплату, ${num(r.awaiting)} ещё ждут оплаты` : undefined}
                  >
                    {num(r.rejected)}
                    {r.online && (r.timedOut > 0 || r.awaiting > 0) && (
                      <span className="text-[var(--text-faint)]"> +{num(r.timedOut)} неопл.</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Panel>
  );
}
