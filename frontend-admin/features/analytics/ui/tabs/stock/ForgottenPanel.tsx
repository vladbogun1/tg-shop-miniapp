import { Archive } from "lucide-react";
import Link from "next/link";
import { num, uah } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { Empty, Panel, TableWrap, useLimited } from "../../kit";
import { editHref } from "./shared";

export function ForgottenPanel({ rows }: { rows: Stock["forgotten"] }) {
  const forgottenRows = useLimited(rows, 8);
  return (
  <Panel title="Забытый сток" icon={Archive} hint="Скрытые и архивные товары, у которых остаток больше нуля: либо вернуть в продажу, либо обнулить остаток">
    {rows.length === 0 ? (
      <Empty>Нет</Empty>
    ) : (
      <>
      <TableWrap>
        <table className="mx-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th>Где</th>
              <th className="r">Остаток</th>
              <th className="r">По рознице</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {forgottenRows.visible.map((f) => (
              <tr key={f.productId}>
                <td className="font-semibold">{f.title}</td>
                <td className="text-[var(--text-muted)]">{f.archived ? "в архиве" : "скрыт"}</td>
                <td className="r">{num(f.stock)}</td>
                <td className="r">{uah(f.valueMinor)}</td>
                <td className="r">
                  <Link href={editHref(f.productId)} className="text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                    Открыть
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {forgottenRows.toggle}
      </>
    )}
  </Panel>
  );
}
