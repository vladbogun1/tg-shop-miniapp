import { Pencil, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { formatNumber } from "@shop/core/money";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { num } from "../../../model/format";
import type { Stock } from "../../../model/types";
import { Empty, Note, Panel, TableWrap, useLimited } from "../../kit";
import { editHref, UrgencyChip } from "./shared";

const COVER_OPTIONS = [14, 30, 60, 90] as const;

export function ReorderPanel({ s, coverDays, setCoverDays }: { s: Stock; coverDays: number; setCoverDays: (n: number) => void }) {
  const reorderRows = useLimited(s.reorder.rows, 12);
  return (
  <Panel
    title="Что дозаказать"
    icon={ShoppingCart}
    hint="Хорошо продаётся и скоро закончится. Рекомендуемое количество — чтобы хватило на выбранный срок."
    actions={
      <SegmentedControl
        size="sm"
        options={COVER_OPTIONS.map((d) => ({ value: String(d), label: `на ${d} дн` }))}
        value={String(coverDays)}
        onChange={(v) => setCoverDays(Number(v))}
      />
    }
  >
    {s.reorder.rows.length === 0 ? (
      <Empty>Ничего не заканчивается в ближайшие {coverDays} дней</Empty>
    ) : (
      <>
      <TableWrap>
        <table className="mx-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="r">Остаток</th>
              <th className="r">Продано 30 / 90 дн</th>
              <th className="r">В месяц</th>
              <th>Закончится через</th>
              <th className="r">Заказать</th>
              <th className="r" title="Просмотры и добавления в корзину за 30 дней">Интерес 30 дн</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {reorderRows.visible.map((r) => (
              <tr key={r.productId + (r.variantId ?? "")}>
                <td>
                  <div className="font-semibold">{r.title}</div>
                  {r.variantName && <div className="text-[11px] text-[var(--text-muted)]">вариант: {r.variantName}</div>}
                </td>
                <td className="r">{num(r.stock)}</td>
                <td className="r">
                  {num(r.sold30)} / {num(r.sold90)}
                </td>
                <td className="r">≈ {formatNumber((Math.round(r.velocityPerDay * 30 * 10) / 10), "ru-RU")}</td>
                <td>
                  <UrgencyChip row={r} />
                </td>
                <td className="r font-semibold">{r.recommendQty > 0 ? `${num(r.recommendQty)} шт.` : "—"}</td>
                <td className="r text-[var(--text-muted)]">
                  {num(r.views30)} просм. · {num(r.cartAdds30)} в корз.
                </td>
                <td className="r">
                  <Link href={editHref(r.productId)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                    <Pencil className="h-3.5 w-3.5" /> Остаток
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {reorderRows.toggle}
      </>
    )}
    <div className="mt-3">
      <Note>{s.reorder.method}</Note>
    </div>
  </Panel>
  );
}
