"use client";

import { Button } from "@shop/ui/admin-button";
import { Factory, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { CsvButton, ReleaseButton, lineTitle, type Demand, type useDemand } from "@/features/procurement";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";
import { Stat } from "./BatchStat";

/** «Чего ждут»: спрос по товарам и вариантам; раздать брони, выгрузить CSV, заказать у завода. */
export function DemandList({ q, onOrder }: { q: ReturnType<typeof useDemand>; onOrder: (d: Demand) => void }) {
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.people - a.people || b.units - a.units), [q.data]);
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем спрос">
      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Пока никто не ждёт" description="Здесь появятся товары, на которые покупатели встали в очередь." />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex justify-end">
            <CsvButton scope={{}} />
          </div>
          {rows.map((d) => (
            <div key={`${d.productId}:${d.variantId ?? ""}`} className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <Image src={d.imageUrl} alt={d.title} size={120} className="h-14 w-14 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]" />
              <div className="min-w-0 flex-1 basis-56">
                <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">
                  {lineTitle(d.title, d.variantName)}
                </div>
                <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
                  {money(d.priceMinor)} · на складе {d.stock} · первый встал {formatDateTime(d.firstAt)}
                </div>
              </div>
              <Stat label="Ждут" value={`${d.people} чел / ${d.units} шт`} accent />
              <Stat label="Новых за 7 дней" value={`+${d.newLast7d}`} />
              <div className="flex min-w-[11rem] flex-wrap items-center gap-2">
                {d.stock > 0 && <ReleaseButton rows={[d]} label={lineTitle(d.title, d.variantName)} />}
                <CsvButton scope={{ productId: d.productId, variantId: d.variantId }} />
                {d.openBatchId != null ? (
                  <Link href={`/preorders/${d.openBatchId}`} className="text-[13px] font-semibold text-[var(--accent-hi)] hover:underline">
                    уже едет: {d.openBatchTitle}
                  </Link>
                ) : (
                  <Button size="sm" variant="outline" icon={<Factory className="h-4 w-4" />} onClick={() => onOrder(d)}>
                    Заказать у завода
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}
