"use client";

/**
 * «Метрики → Предзаказы»: сколько людей встало в очередь, сколько получили бронь, купили из брони,
 * бронь сгорела, конверсия и сколько штук приехало. Период — тот же, что на других вкладках
 * (календарные дни по Киеву); сервер принимает from/to, поэтому токен периода переводим в даты здесь.
 */
import { motion } from "framer-motion";
import { staggerContainer } from "@/lib/motion";
import { QueryState } from "@/components/ui/QueryState";
import { periodRange } from "../../model/period";
import type { PeriodParams, PreorderMetrics } from "../../model/types";
import { usePreorderMetrics } from "../../queries";
import { num, pct } from "../../model/format";
import { KpiTile, Note } from "../kit";

export function PreordersTab({ params }: { params: PeriodParams }) {
  const { from, to } = periodRange(params);
  const q = usePreorderMetrics(from, to);
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
