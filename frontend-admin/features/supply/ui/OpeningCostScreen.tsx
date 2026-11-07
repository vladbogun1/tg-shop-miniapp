"use client";

/**
 * «Начальная себестоимость» (route "/opening-cost", право «Финансы»): старый остаток, купленный до появления
 * поставок, — вводим цену закупки за штуку, чтобы маржа по нему считалась. Кнопка «Выровнять партии со складом»
 * подгоняет партии FIFO под фактический остаток каждого товара.
 */
import { Button } from "@shop/ui/admin-button";
import { ArrowLeft, Check, Scale, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";
import { lineTitle, type OpeningRow, type Reconcile } from "@/features/procurement";
import { useOpeningRows, useReconcile } from "../queries";
import { BulkOpeningBar } from "./BulkOpeningBar";
import { OpeningLine } from "./OpeningLine";

const rowKey = (r: Pick<OpeningRow, "productId" | "variantId">) => `${r.productId}|${r.variantId ?? ""}`;

/** Экран «Начальная себестоимость». */
export function OpeningCostScreen() {
  const q = useOpeningRows();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [result, setResult] = useState<Reconcile | null>(null);

  const reconcile = useReconcile();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const all = q.data ?? [];
  const needle = search.trim().toLowerCase();
  const rows = (onlyMissing ? all.filter((r) => r.unitCostMinor == null) : all).filter(
    (r) => !needle || lineTitle(r.title, r.variantName).toLowerCase().includes(needle),
  );
  const chosen = all.filter((r) => picked.has(rowKey(r)));
  const toggle = (r: OpeningRow) =>
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(rowKey(r))) n.add(rowKey(r));
      return n;
    });
  const missing = all.filter((r) => r.unitCostMinor == null).length;

  return (
    <div className="min-w-0">
      <Link
        href="/metrics?tab=margin"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Метрики → Маржа
      </Link>
      <PageHeader
        title="Начальная себестоимость"
        subtitle="Старый остаток без цены закупки. Укажите, во сколько обошлась штука, — и маржа по нему посчитается. Пустое поле — «нет данных»."
        actions={
          <Button
            variant="outline"
            icon={<Scale className="h-4 w-4" />}
            loading={reconcile.isPending}
            onClick={() => reconcile.mutate(undefined, { onSuccess: setResult })}
          >
            Выровнять партии со складом
          </Button>
        }
      />

      {result && (
        <div className="card mb-4 p-3 text-[13px]">
          <div className="font-semibold text-[var(--text)]">
            Проверено товаров: {result.keys}, выровнено: {result.fixed}
          </div>
          {result.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[var(--text-muted)]">
              {result.details.slice(0, 20).map((d, i) => (
                <li key={i} className="break-words">
                  {d}
                </li>
              ))}
              {result.details.length > 20 && <li>…и ещё {result.details.length - 20}</li>}
            </ul>
          )}
        </div>
      )}

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка остатка">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Toggle checked={onlyMissing} onChange={setOnlyMissing} label={`Только без себестоимости (${missing})`} />
          <span className="text-[12.5px] text-[var(--text-faint)]">Всего позиций старого остатка: {all.length}</span>
        </div>
        <label className="relative mb-3 block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти товар"
            aria-label="Найти товар"
            className="h-[42px] w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] pl-9 pr-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
          />
        </label>
        {rows.length === 0 ? (
          <EmptyState icon={Check} title={onlyMissing ? "У всего старого остатка есть себестоимость" : "Старого остатка нет"} />
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            {rows.map((r) => (
              <OpeningLine key={rowKey(r)} row={r} selected={picked.has(rowKey(r))} onToggle={() => toggle(r)} />
            ))}
          </div>
        )}
        {chosen.length > 0 && <BulkOpeningBar rows={chosen} onClear={() => setPicked(new Set())} />}
      </QueryState>
    </div>
  );
}
