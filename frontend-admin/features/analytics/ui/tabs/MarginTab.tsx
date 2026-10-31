"use client";

/**
 * «Метрики → Маржа» (только с правом «Финансы»): выручка, себестоимость, комиссии, прибыль, стоимость склада
 * и разрезы по товарам / брендам / категориям / поставкам. Суммы — по продажам с известной себестоимостью.
 */
import { motion } from "framer-motion";
import { Percent, Warehouse } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/cn";
import type { MarginReport, MarginRow, PeriodParams } from "../../model/types";
import { useMarginReport } from "../../queries";
import { num, pct, uah, uahExact } from "../../model/format";
import { toPercent } from "@shop/core/percent";
import { Empty, KpiTile, Note, Panel, TableWrap, useLimited } from "../kit";

export function MarginTab({ params }: { params: PeriodParams }) {
  const q = useMarginReport(params);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем маржу…">
      {q.data && <MarginBody r={q.data} />}
    </QueryState>
  );
}

const GROUPS = [
  { value: "byProduct", label: "Товары" },
  { value: "byBrand", label: "Бренды" },
  { value: "byCategory", label: "Категории" },
  { value: "byBatch", label: "Поставки" },
] as const;
type Group = (typeof GROUPS)[number]["value"];

function MarginBody({ r }: { r: MarginReport }) {
  const [group, setGroup] = useState<Group>("byProduct");
  const rows: MarginRow[] = r[group];
  const lim = useLimited(rows, 15);
  const noCostRevenue = Math.max(0, r.revenueMinor - r.knownRevenueMinor);
  const label = GROUPS.find((g) => g.value === group)?.label ?? "";

  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Выручка" value={uah(r.revenueMinor)} hint={noCostRevenue > 0 ? `без себестоимости: ${uah(noCostRevenue)}` : "себестоимость известна у всей выручки"} />
        <KpiTile
          label="С известной себестоимостью"
          value={uah(r.knownRevenueMinor)}
          hint={r.knownShare != null ? `${pct(toPercent(r.knownShare))} выручки — остальное в расчёт не входит` : undefined}
        />
        <KpiTile label="Себестоимость" value={uah(r.costMinor)} />
        <KpiTile label="Комиссии эквайринга" value={uahExact(r.feeMinor)} />
        <KpiTile label="Подарки" value={uah(r.giftsCostMinor)} hint="их себестоимость, уже входит в общую" />
        <KpiTile label="Прибыль" value={uah(r.profitMinor)} hint="выручка с известной себестоимостью − себестоимость − комиссии" />
        <KpiTile label="Маржа" value={pct(r.marginPct)} />
        <KpiTile
          label="Склад по себестоимости"
          value={uah(r.stockValueMinor)}
          hint={`${num(r.stockUnits)} шт.${r.stockUnknownUnits > 0 ? ` · без себестоимости ${num(r.stockUnknownUnits)} шт.` : ""}`}
        />
      </div>

      {r.stockUnknownUnits > 0 && (
        <Note>
          У {num(r.stockUnknownUnits)} шт. на складе нет себестоимости (старый остаток). Внесите её в{" "}
          <Link href="/opening-cost" className="font-semibold text-[var(--accent-hi)] hover:underline">
            «Начальной себестоимости»
          </Link>{" "}
          — тогда маржа по ним тоже посчитается.
        </Note>
      )}

      <Panel
        title={`Маржа: ${label.toLowerCase()}`}
        icon={Percent}
        hint="Выручка с известной себестоимостью, её себестоимость и прибыль. «Без себестоимости» — выручка, по которой посчитать нечем."
        actions={<SegmentedControl size="sm" options={GROUPS.map((g) => ({ value: g.value, label: g.label }))} value={group} onChange={setGroup} />}
      >
        {rows.length === 0 ? (
          <Empty>Продаж с известной себестоимостью за период нет</Empty>
        ) : (
          <>
            <TableWrap>
              <table className="mx-table">
                <thead>
                  <tr>
                    <th>{label.replace(/ы$/, "")}</th>
                    <th className="r">Шт.</th>
                    <th className="r">Выручка</th>
                    <th className="r">Себестоимость</th>
                    <th className="r">Прибыль</th>
                    <th className="r">Маржа</th>
                    <th className="r">Без себестоимости</th>
                  </tr>
                </thead>
                <tbody>
                  {lim.visible.map((x) => (
                    <tr key={x.key}>
                      <td className="font-semibold">{x.label}</td>
                      <td className="r">{num(x.units)}</td>
                      <td className="r">{uah(x.revenueMinor)}</td>
                      <td className="r">{uah(x.costMinor)}</td>
                      <td className={cn("r font-semibold", x.profitMinor < 0 ? "text-[#F87171]" : "text-[var(--ok)]")}>{uah(x.profitMinor)}</td>
                      <td className="r">{pct(x.marginPct)}</td>
                      <td className="r text-[var(--text-muted)]">{x.unknownRevenueMinor > 0 ? uah(x.unknownRevenueMinor) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {lim.toggle}
          </>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--text-muted)]">
        <Warehouse className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
        <Link href="/opening-cost" className="font-semibold text-[var(--accent-hi)] hover:underline">
          Начальная себестоимость
        </Link>
        <span>— старый остаток без цены закупки и выравнивание партий со складом</span>
      </div>
    </motion.div>
  );
}
