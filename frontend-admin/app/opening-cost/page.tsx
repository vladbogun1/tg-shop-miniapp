"use client";

/**
 * «Начальная себестоимость» (route "/opening-cost", право «Финансы»): старый остаток, купленный до появления
 * поставок, — вводим цену закупки за штуку, чтобы маржа по нему считалась. Кнопка «Выровнять партии со складом»
 * подгоняет партии FIFO под фактический остаток каждого товара.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Scale } from "lucide-react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { COSTING_KEY, costingApi, inputToMinor, minorToInput, type OpeningRow, type Reconcile } from "@/lib/costing";
import { lineTitle } from "@/lib/preorders";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { Toggle } from "@/components/ui/Toggle";

const rowKey = (r: Pick<OpeningRow, "productId" | "variantId">) => `${r.productId}|${r.variantId ?? ""}`;

export default function OpeningCostPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const q = useQuery({ queryKey: [...COSTING_KEY, "opening"], queryFn: costingApi.opening, retry: false });
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [result, setResult] = useState<Reconcile | null>(null);

  const reconcile = useMutation({
    mutationFn: costingApi.reconcile,
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: COSTING_KEY });
      push(r.fixed > 0 ? `Выровнено: ${r.fixed} из ${r.keys}` : "Партии уже совпадают со складом", "ok");
    },
    onError: (e) => push(e instanceof ApiError ? e.message : "Не удалось выровнять", "error"),
  });

  const all = q.data ?? [];
  const rows = onlyMissing ? all.filter((r) => r.unitCostMinor == null) : all;
  const missing = all.filter((r) => r.unitCostMinor == null).length;

  return (
    <div className="min-w-0">
      <Link href="/metrics?tab=margin" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" /> Метрики → Маржа
      </Link>
      <PageHeader
        title="Начальная себестоимость"
        subtitle="Старый остаток без цены закупки. Укажите, во сколько обошлась штука, — и маржа по нему посчитается. Пустое поле — «нет данных»."
        actions={
          <Button variant="outline" icon={<Scale className="h-4 w-4" />} loading={reconcile.isPending} onClick={() => reconcile.mutate()}>
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
                <li key={i} className="break-words">{d}</li>
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
        {rows.length === 0 ? (
          <EmptyState icon={Check} title={onlyMissing ? "У всего старого остатка есть себестоимость" : "Старого остатка нет"} />
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            {rows.map((r) => (
              <OpeningLine key={rowKey(r)} row={r} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}

function OpeningLine({ row }: { row: OpeningRow }) {
  const qc = useQueryClient();
  const { push } = useToast();
  const saved = minorToInput(row.unitCostMinor);
  const [value, setValue] = useState(saved);
  const changed = value.trim() !== saved;
  const minor = inputToMinor(value);
  const invalid = value.trim() !== "" && (minor == null || minor < 0);

  const save = useMutation({
    mutationFn: () => costingApi.setOpening({ productId: row.productId, variantId: row.variantId, unitCostMinor: value.trim() ? minor : null }),
    onSuccess: (rows) => {
      qc.setQueryData([...COSTING_KEY, "opening"], rows);
      setValue(value.trim() ? minorToInput(minor) : "");
      qc.invalidateQueries({ queryKey: [...COSTING_KEY, "product", row.productId] });
      qc.invalidateQueries({ queryKey: [...COSTING_KEY, "report"] });
      push("Сохранено", "ok");
    },
    onError: (e) => push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error"),
  });

  const margin = minor != null && minor > 0 && row.priceMinor > 0 ? ((row.priceMinor - minor) / row.priceMinor) * 100 : null;

  return (
    <div className="card flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <Image src={row.imageUrl} alt={row.title} size={120} className="h-12 w-12 shrink-0 rounded-[var(--r-md)] border border-[var(--line)]" />
      <div className="min-w-0 flex-1 basis-52">
        <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{lineTitle(row.title, row.variantName)}</div>
        <div className="text-[12px] text-[var(--text-faint)]">
          {row.units} шт. · цена {money(row.priceMinor)}
          {margin != null && ` · маржа ${margin.toFixed(1).replace(".", ",")} %`}
        </div>
      </div>
      {row.unitCostMinor == null ? <Badge tone="warn">нет данных</Badge> : <Badge tone="ok">{money(row.unitCostMinor)}</Badge>}
      <div className="flex items-start gap-2">
        <Input
          aria-label="Себестоимость за штуку, ₴"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && changed && !invalid) save.mutate();
          }}
          placeholder="₴ за штуку"
          error={invalid ? "Некорректная сумма" : undefined}
          className="w-28"
        />
        <Button variant={changed ? "accent" : "outline"} loading={save.isPending} disabled={!changed || invalid} onClick={() => save.mutate()}>
          Сохранить
        </Button>
      </div>
    </div>
  );
}
