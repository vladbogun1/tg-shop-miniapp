import { EyeOff, PackageX, Snowflake } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { num, uah, uahShort } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { useHideDeadProduct } from "../../../queries";
import { Empty, Panel, TableWrap, useLimited } from "../../kit";
import { editHref } from "./shared";

export function DeadStockPanel({ s, deadDays, setDeadDays }: { s: Stock; deadDays: number; setDeadDays: (n: number) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const deadRows = useLimited(s.deadStock, 12);
  const hide = useHideDeadProduct(() => setConfirm(null));

  return (
    <Panel
      title="Не продаётся"
      icon={Snowflake}
      hint="Товары на витрине с остатком, которые не продавались выбранное число дней (новые товары моложе этого срока не считаются). Сумма — по розничной цене."
      actions={
        <div className="flex flex-wrap gap-2">
          {s.deadStockBuckets.map((b) => (
            <button
              key={b.days}
              type="button"
              onClick={() => setDeadDays(b.days)}
              aria-pressed={b.days === deadDays}
              className={`nb-chip nb-press mx-num px-3 py-1 text-left text-[12px] transition-colors ${
                b.days === deadDays ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
              }`}
            >
              {b.days}+ дн · {num(b.products)} · {uahShort(b.valueMinor)}
            </button>
          ))}
        </div>
      }
    >
      {s.deadStock.length === 0 ? (
        <Empty>Всё продаётся</Empty>
      ) : (
        <>
          <TableWrap>
          <table className="mx-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th className="r">Остаток</th>
                <th className="r">Заморожено</th>
                <th className="r">Без продаж</th>
                <th className="r" title="Просмотры карточки за 30 дней">Просмотры</th>
                <th className="r" title="Добавления в корзину за 30 дней">В корзину</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deadRows.visible.map((d) => (
                <tr key={d.productId}>
                  <td>
                    <div className="font-semibold">{d.title}</div>
                    {d.tags.length > 0 && <div className="text-[11px] text-[var(--text-faint)]">{d.tags.join(", ")}</div>}
                  </td>
                  <td className="r">{num(d.stock)}</td>
                  <td className="r font-semibold">{uah(d.valueMinor)}</td>
                  <td className="r">{d.neverSold ? `ни разу (${num(d.daysWithoutSale)} дн)` : `${num(d.daysWithoutSale)} дн`}</td>
                  <td className="r">{d.views30 == null ? "—" : num(d.views30)}</td>
                  <td className="r">{d.cartAdds30 == null ? "—" : num(d.cartAdds30)}</td>
                  <td className="r whitespace-nowrap">
                    <Link
                      href={editHref(d.productId)}
                      className="mr-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline max-sm:min-h-10"
                      title="Открыть товар: поставить старую цену (скидку) или уценить (состояние «Уценка»)"
                    >
                      <PackageX className="h-3.5 w-3.5" /> Скидка
                    </Link>
                    {confirm === d.productId ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          disabled={hide.isPending}
                          onClick={() => hide.mutate(d.productId)}
                          className="rounded-[var(--r-sm)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--danger-ink)] max-sm:min-h-10 hover:bg-[color-mix(in_srgb,var(--danger)_24%,transparent)]"
                        >
                          Скрыть?
                        </button>
                        <button type="button" onClick={() => setConfirm(null)} className="text-[12px] text-[var(--text-muted)] max-sm:min-h-10 max-sm:px-2">
                          нет
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirm(d.productId)}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] max-sm:min-h-10"
                      >
                        <EyeOff className="h-3.5 w-3.5" /> Скрыть
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
          {deadRows.toggle}
          </>
      )}
    </Panel>
  );
}
