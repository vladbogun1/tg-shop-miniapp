"use client";

import { Button } from "@shop/ui/admin-button";
import { ChevronDown, Factory } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { QueryState } from "@/components/ui/QueryState";
import { CsvButton, ReleaseButton, lineTitle, type Demand, type useDemand } from "@/features/procurement";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";

/** Сколько товаров «Что заказать» видно сразу; остальное — по «Показать все». */
const TOP = 3;

/**
 * Блок «Что заказать» над списком поставок: товары, которых ждут покупатели, — самые ждущие сверху.
 * Раздать брони (если товар уже на складе), выгрузить CSV, заказать у завода. Никто не ждёт — блока нет.
 */
export function DemandList({ q, expanded, onOrder }: { q: ReturnType<typeof useDemand>; expanded?: boolean; onOrder: (d: Demand) => void }) {
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.people - a.people || b.units - a.units), [q.data]);
  const [all, setAll] = useState(!!expanded);
  if (!q.isLoading && !q.isError && rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, TOP);
  return (
    <section id="demand" className="mb-7 min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.05em] text-[var(--ink)]">Что заказать</h2>
        <span className="text-[12.5px] text-[var(--text-muted)]">
          товары, которых ждут покупатели
          {rows.length ? ` · ${rows.length}` : ""}
        </span>
        {rows.length > 0 && (
          <span className="ml-auto">
            <CsvButton scope={{}} />
          </span>
        )}
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем, чего ждут">
        <div className="flex min-w-0 flex-col gap-2">
          {shown.map((d) => (
            <DemandRow key={`${d.productId}:${d.variantId ?? ""}`} d={d} onOrder={onOrder} />
          ))}
          {rows.length > TOP && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              icon={<ChevronDown className={all ? "h-4 w-4 rotate-180" : "h-4 w-4"} />}
              onClick={() => setAll(!all)}
            >
              {all ? "Свернуть" : `Показать все ${rows.length}`}
            </Button>
          )}
        </div>
      </QueryState>
    </section>
  );
}

function DemandRow({ d, onOrder }: { d: Demand; onOrder: (d: Demand) => void }) {
  return (
    <div className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        <Image src={d.imageUrl} alt={d.title} size={120} className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]" />
        <div className="min-w-0">
          <div className="break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{lineTitle(d.title, d.variantName)}</div>
          <div className="tabular mt-0.5 text-[12.5px]">
            <b className="text-[var(--accent-hi)]">
              ждут {d.people} чел. · {d.units} шт
            </b>
            {d.newLast7d > 0 && <span className="text-[var(--text-muted)]"> · +{d.newLast7d} за неделю</span>}
          </div>
          <div className="tabular text-[12px] text-[var(--text-faint)]">
            {money(d.priceMinor)} · на складе {d.stock} · первый ждёт с {formatDateTime(d.firstAt)}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {d.stock > 0 && <ReleaseButton rows={[d]} label={lineTitle(d.title, d.variantName)} />}
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
  );
}
