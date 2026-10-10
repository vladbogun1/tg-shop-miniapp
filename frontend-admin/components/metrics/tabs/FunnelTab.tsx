"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Filter, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { QueryState } from "@/components/ui/QueryState";
import { staggerContainer } from "@/lib/motion";
import { metricsApi, type Funnel, type PeriodParams } from "../api";
import { FunnelBars } from "../charts";
import { num, pct } from "../format";
import { Empty, Note, Panel, StatusChip, TableWrap } from "../ui";
import { editHref } from "./StockTab";

export function FunnelTab({ params }: { params: PeriodParams }) {
  // "Все" is the sum of both channels: the backend keeps each channel's visitors apart.
  const q = useQuery({
    queryKey: ["metrics2", "funnel", params],
    queryFn: () => metricsApi.funnel(params),
    placeholderData: keepPreviousData,
  });
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Строим воронку…">
      {q.data && <FunnelBody f={q.data} channel={params.channel} />}
    </QueryState>
  );
}

function FunnelBody({ f, channel }: { f: Funnel; channel: string }) {
  const biggestDrop = f.steps
    .slice(1, 4)
    .filter((s) => s.fromPrevPct != null)
    .sort((a, b) => (a.fromPrevPct ?? 100) - (b.fromPrevPct ?? 100))[0];
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-4">
      <Panel
        title={`Воронка — ${channel === "web" ? "сайт" : channel === "miniapp" ? "Mini App" : "все каналы"}`}
        icon={Filter}
        hint="Первые четыре шага — уникальные посетители по журналу событий; «Оформили», «Оплатили», «Отправлено» — уникальные покупатели по самим заказам."
      >
        <FunnelBars steps={f.steps} />
        <div className="mt-4 flex flex-col gap-2">
          {channel === "all" && (
            <Note>
              Сумма сайта и Mini App. Кто заходил и туда, и туда, в первых четырёх шагах посчитан дважды: на сайте посетитель —
              это браузер, в Mini App — аккаунт Telegram. Каналы по отдельности — переключателем «Mini App» / «Сайт».
            </Note>
          )}
          {biggestDrop && biggestDrop.fromPrevPct != null && (
            <Note>
              Больше всего теряем на шаге «{biggestDrop.label}»: доходят {pct(biggestDrop.fromPrevPct)} с предыдущего шага.
            </Note>
          )}
          {f.note && <Note>{f.note}</Note>}
          {f.dataSince && (
            <p className="text-[11px] text-[var(--text-faint)]">
              События собираются с {f.dataSince.split("-").reverse().join(".")}; журнал хранится 30 дней, а дневные итоги — без срока.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="Много смотрят — мало покупают"
        icon={ShoppingCart}
        hint="Товары, которые открыли 5+ человек (уникальные за день), а купили меньше 5% из них. Проверьте цену, фото, описание, наличие вариантов."
      >
        {f.lowConversion.length === 0 ? (
          <Empty>Таких товаров нет</Empty>
        ) : (
          <TableWrap>
            <table className="mx-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th className="r">Смотрели</th>
                  <th className="r">В корзину</th>
                  <th className="r">Купили</th>
                  <th className="r">Конверсия</th>
                  <th className="r">Остаток</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.lowConversion.map((r) => (
                  <tr key={r.productId}>
                    <td className="font-semibold">{r.title}</td>
                    <td className="r" title={`${num(r.views)} просмотров`}>
                      {num(r.viewers)} чел.
                    </td>
                    <td className="r">{num(r.cartAdds)}</td>
                    <td className="r">{num(r.buyers)}</td>
                    <td className="r">{pct(r.conversionPct)}</td>
                    <td className="r">{r.live ? num(r.stock) : <StatusChip tone="muted">○ скрыт</StatusChip>}</td>
                    <td className="r">
                      <Link href={editHref(r.productId)} className="text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </motion.div>
  );
}
