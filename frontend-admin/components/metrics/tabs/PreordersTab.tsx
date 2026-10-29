"use client";

/**
 * «Метрики → Предзаказы»: сколько людей встало в очередь, сколько получили бронь, купили из брони,
 * бронь сгорела, конверсия и сколько штук приехало. Период — тот же, что на других вкладках
 * (календарные дни по Киеву); сервер принимает from/to, поэтому токен периода переводим в даты здесь.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { staggerContainer } from "@/lib/motion";
import { PREORDERS_KEY, preordersApi, type PreorderMetrics } from "@/lib/preorders";
import { QueryState } from "@/components/ui/QueryState";
import type { PeriodParams } from "../api";
import { num, pct } from "../format";
import { KpiTile, Note } from "../ui";
import { todayIso } from "../period";

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Токен периода → [from, to] (yyyy-MM-dd, Киев). */
export function periodRange(p: PeriodParams): { from: string; to: string } {
  const today = todayIso();
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (p.period) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: shift(today, -6), to: today };
    case "90d":
      return { from: shift(today, -89), to: today };
    case "month":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "prevmonth": {
      const first = `${y}-${pad(m)}-01`;
      return { from: shift(first, -1).slice(0, 8) + "01", to: shift(first, -1) };
    }
    case "year":
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: p.from ?? today, to: p.to ?? today };
  }
}

export function PreordersTab({ params }: { params: PeriodParams }) {
  const { from, to } = periodRange(params);
  const q = useQuery({
    queryKey: [...PREORDERS_KEY, "metrics", from, to],
    queryFn: () => preordersApi.metrics(from, to),
    placeholderData: keepPreviousData,
    retry: false,
  });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем предзаказы…">
      {q.data && <Body m={q.data} />}
    </QueryState>
  );
}

function Body({ m }: { m: PreorderMetrics }) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Подписок в очередь" value={num(m.subscriptions)} hint="сколько раз встали «ждать»" />
        <KpiTile label="Человек ждали" value={num(m.people)} hint="разные люди за период" />
        <KpiTile label="Получили бронь" value={num(m.holdsGiven)} />
        <KpiTile label="Купили из брони" value={num(m.boughtFromHold)} />
        <KpiTile label="Бронь сгорела" value={num(m.expired)} hint="не успели выкупить" />
        <KpiTile label="Конверсия" value={pct(m.conversionPercent)} hint="купили из брони / получили бронь" />
        <KpiTile label="Приехало, шт" value={num(m.arrivedUnits)} hint="по закрытым поставкам" />
      </div>
      <Note>Период — календарные дни по Киеву. Канал (Mini App / сайт) здесь не учитывается.</Note>
    </motion.div>
  );
}
