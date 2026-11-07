"use client";

import { Button } from "@shop/ui/admin-button";
import { Factory, Search, Truck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { CsvButton, ReleaseButton, lineTitle, type Demand, type useDemand } from "@/features/procurement";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { formatDateTime } from "@shop/core/time";

type Chip = "all" | "todo" | "going" | "stock";

const CHIPS: { value: Chip; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "todo", label: "Не заказано" },
  { value: "going", label: "Уже едет" },
  { value: "stock", label: "Есть на складе" },
];

const keyOf = (d: Pick<Demand, "productId" | "variantId">) => `${d.productId}:${d.variantId ?? ""}`;
const matches: Record<Chip, (d: Demand) => boolean> = {
  all: () => true,
  todo: (d) => d.openBatchId == null,
  going: (d) => d.openBatchId != null,
  stock: (d) => d.stock > 0,
};

/**
 * «Что заказать» (вариант A): товары, которых ждут покупатели, — поиск и чипы, галочки и панель «Заказать выбранные»
 * (одна поставка с несколькими товарами). Раздать брони (если товар уже на складе), CSV, заказать у завода.
 */
export function DemandList({ q, onOrder }: { q: ReturnType<typeof useDemand>; onOrder: (rows: Demand[]) => void }) {
  const [chip, setChip] = useState<Chip>("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) => b.people - a.people || b.units - a.units), [q.data]);
  const needle = search.trim().toLowerCase();
  const shown = rows.filter((d) => matches[chip](d) && (!needle || lineTitle(d.title, d.variantName).toLowerCase().includes(needle)));
  const toBuy = rows.filter((d) => d.openBatchId == null).reduce((n, d) => n + d.units, 0);
  const chosen = rows.filter((d) => picked.has(keyOf(d)));

  const toggle = (d: Demand) =>
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(keyOf(d))) n.add(keyOf(d));
      return n;
    });
  const selectable = shown.filter((d) => d.openBatchId == null);
  const allPicked = selectable.length > 0 && selectable.every((d) => picked.has(keyOf(d)));
  const toggleAll = () =>
    setPicked((s) => {
      const n = new Set(s);
      for (const d of selectable) {
        if (allPicked) n.delete(keyOf(d));
        else n.add(keyOf(d));
      }
      return n;
    });

  return (
    <section id="demand" className="min-w-0 pb-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] text-[var(--text-muted)]">
          Товары, которых ждут покупатели
          {rows.length ? ` · ${rows.length}` : ""}
          {toBuy > 0 && (
            <>
              {" · "}
              <b className="tabular text-[var(--accent-hi)]">нужно купить {toBuy} шт</b>
            </>
          )}
        </span>
        {rows.length > 0 && (
          <span className="ml-auto">
            <CsvButton scope={{}} />
          </span>
        )}
      </div>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Считаем, чего ждут">
        {rows.length === 0 ? (
          <EmptyState icon={Truck} title="Сейчас никто не ждёт товар" description="Когда покупатели нажмут «Сообщить о поступлении» или закажут заранее, товары появятся здесь." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="relative min-w-0 flex-1 basis-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Найти товар"
                  aria-label="Найти товар среди ждущих"
                  className="h-[42px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] pl-9 pr-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
                />
              </label>
              <div className="thin-scroll flex max-w-full gap-1.5 overflow-x-auto">
                {CHIPS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChip(c.value)}
                    className={cn(
                      "min-h-[44px] shrink-0 whitespace-nowrap rounded-full border px-3 text-[12.5px] font-semibold lg:min-h-[34px]",
                      chip === c.value
                        ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                        : "border-[var(--line)] text-[var(--text-muted)] hover:text-[var(--text)]",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            {selectable.length > 0 && (
              <label className="mb-2 inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] text-[var(--text-muted)] lg:min-h-0">
                <input type="checkbox" className="h-[18px] w-[18px] accent-[var(--accent)]" checked={allPicked} onChange={toggleAll} />
                Выбрать все не заказанные ({selectable.length})
              </label>
            )}
            <div className="flex min-w-0 flex-col gap-2">
              {shown.map((d) => (
                <DemandRow key={keyOf(d)} d={d} checked={picked.has(keyOf(d))} onToggle={() => toggle(d)} onOrder={(x) => onOrder([x])} />
              ))}
              {shown.length === 0 && <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">Ничего не нашли — поменяйте поиск или фильтр.</p>}
            </div>
          </>
        )}
      </QueryState>
      {chosen.length > 0 && (
        <div className="elevated sticky bottom-[calc(var(--tabbar-h,0px)+12px)] z-20 mt-4 flex flex-wrap items-center gap-3 p-3">
          <span className="tabular min-w-0 flex-1 basis-40 text-[13px] text-[var(--text)]">
            Выбрано <b>{chosen.length}</b> · {chosen.reduce((n, d) => n + Math.max(1, d.units), 0)} шт
          </span>
          <Button variant="ghost" onClick={() => setPicked(new Set())}>
            Снять
          </Button>
          <Button variant="accent" icon={<Factory className="h-4 w-4" />} onClick={() => onOrder(chosen)}>
            Заказать выбранные
          </Button>
        </div>
      )}
    </section>
  );
}

function DemandRow({ d, checked, onToggle, onOrder }: { d: Demand; checked: boolean; onToggle: () => void; onOrder: (d: Demand) => void }) {
  const going = d.openBatchId != null;
  return (
    <div className={cn("card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3", checked && "border-[var(--accent)]")}>
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3">
        <label className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center lg:-m-1 lg:h-8 lg:w-8">
          <input
            type="checkbox"
            checked={checked}
            disabled={going}
            onChange={onToggle}
            aria-label={`Выбрать: ${lineTitle(d.title, d.variantName)}`}
            title={going ? "Уже едет в поставке" : undefined}
            className="h-[18px] w-[18px] accent-[var(--accent)] disabled:opacity-40"
          />
        </label>
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
        {going ? (
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
