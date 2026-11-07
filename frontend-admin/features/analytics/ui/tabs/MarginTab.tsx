"use client";

/**
 * «Метрики → Маржа» (только с правом «Финансы»): плитки выручки/себестоимости/комиссий/прибыли, водопад
 * «Откуда прибыль», «Где теряю» и таблица по товарам / брендам / категориям / поставкам. Суммы — по
 * продажам с известной себестоимостью. Канал отчёт не режет (в шапке это помечено).
 */
import { motion } from "framer-motion";
import { Warehouse } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { staggerContainer } from "@/lib/motion";
import type { MarginReport, MarginRow, PeriodParams } from "../../model/types";
import { useMarginReport } from "../../queries";
import { num, pct, uah, uahExact } from "../../model/format";
import { toPercent } from "@shop/core/percent";
import { KpiTile, Note } from "../kit";
import { MarginLosing } from "./margin/MarginLosing";
import { MarginTable } from "./margin/MarginTable";
import { MarginWaterfall } from "./margin/MarginWaterfall";

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

      {noCostRevenue > 0 && (
        <Note>
          Себестоимость известна у {pct(toPercent(r.knownShare))} выручки. По остальным {uah(noCostRevenue)} посчитать прибыль нечем —
          они не входят в прибыль и маржу.
        </Note>
      )}
      {r.stockUnknownUnits > 0 && (
        <Note>
          У {num(r.stockUnknownUnits)} шт. на складе нет себестоимости (старый остаток), поэтому «Склад по себестоимости» занижен. Внесите её в{" "}
          <Link href="/opening-cost" className="font-semibold text-[var(--accent-hi)] hover:underline">
            «Начальной себестоимости»
          </Link>{" "}
          — тогда маржа по ним тоже посчитается.
        </Note>
      )}

      <MarginWaterfall r={r} />
      <MarginLosing rows={rows} groupLabel={label} />
      <MarginTable
        rows={rows}
        label={label}
        actions={<SegmentedControl size="sm" options={GROUPS.map((g) => ({ value: g.value, label: g.label }))} value={group} onChange={setGroup} />}
      />

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
