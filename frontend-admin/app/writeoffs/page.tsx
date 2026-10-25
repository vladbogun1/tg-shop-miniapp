"use client";

/**
 * «Списания» (route "/writeoffs"): stock that left the shelf without a sale — defects (from returns and
 * exchanges), inventory counts, mis-sorts, sales outside the site — for a period, valued at the price
 * the loss was counted at. Rows come from lowering stock in the product form (a reason is mandatory)
 * and from returns. GET /api/admin/stock-writeoffs?range=.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageMinus } from "lucide-react";
import { writeoffsApi, WRITEOFF_LABEL, WRITEOFF_RANGES, type WriteoffLine, type WriteoffRange, type WriteoffReport } from "@/lib/writeoffs";
import { money } from "@/lib/money";
import { formatDateTime } from "@/lib/orders";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

export default function WriteoffsPage() {
  const [range, setRange] = useState<WriteoffRange>("month");
  const q = useQuery({ queryKey: ["writeoffs", range], queryFn: () => writeoffsApi.report(range) });

  return (
    <div className="min-w-0">
      <PageHeader
        title="Списания"
        subtitle="Товар, который ушёл с полки без продажи: брак, пересчёт, пересорт, продажа вне сайта."
        actions={<SegmentedControl options={WRITEOFF_RANGES} value={range} onChange={setRange} />}
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка списаний">
        {q.data && <Report data={q.data} />}
      </QueryState>
    </div>
  );
}

function Report({ data }: { data: WriteoffReport }) {
  const tiles = [
    { label: "Всего списано", value: `${data.totalUnits} шт`, accent: true },
    { label: "На сумму", value: money(data.totalValueMinor), accent: true },
    ...data.byReason
      .filter((t) => t.lines > 0)
      .map((t) => ({ label: WRITEOFF_LABEL[t.reason] ?? t.reason, value: `${t.units} шт · ${money(t.valueMinor)}`, accent: false })),
  ];
  return (
    <>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card-2 min-w-0 px-3 py-2.5">
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div className="tabular mt-1 break-words font-display text-[16px] font-bold leading-tight text-[var(--ink)]">{t.value}</div>
          </div>
        ))}
      </div>

      {data.lines.length === 0 ? (
        <EmptyState icon={PackageMinus} title="Списаний за период нет" description="Здесь появятся строки, когда остаток товара уменьшат вручную или примут возврат с браком." />
      ) : (
        <>
          <div className="panel hidden min-w-0 overflow-x-auto lg:block">
            <table className="w-full min-w-[56rem] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[11.5px] text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-semibold">Дата</th>
                  <th className="px-3 py-2 font-semibold">Товар</th>
                  <th className="px-3 py-2 text-right font-semibold">Шт.</th>
                  <th className="px-3 py-2 font-semibold">Причина</th>
                  <th className="px-3 py-2 font-semibold">Заказ</th>
                  <th className="px-3 py-2 text-right font-semibold">Сумма</th>
                  <th className="px-3 py-2 font-semibold">Админ</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--line)] align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{formatDateTime(l.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="min-w-0 break-words font-medium text-[var(--text)]">{l.title}</div>
                      {l.note && <div className="mt-0.5 break-words text-[12px] text-[var(--text-muted)]">{l.note}</div>}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{l.quantity}</td>
                    <td className="px-3 py-2"><Reason l={l} /></td>
                    <td className="whitespace-nowrap px-3 py-2">{l.orderShortId ? `#${l.orderShortId}` : "—"}</td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                      {money(l.valueMinor)}
                      {l.quantity > 1 && <div className="text-[11.5px] text-[var(--text-faint)]">{l.quantity} × {money(l.unitValueMinor)}</div>}
                    </td>
                    <td className="px-3 py-2">{l.adminName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid min-w-0 gap-2 lg:hidden">
            {data.lines.map((l) => (
              <div key={l.id} className="card-2 min-w-0 px-3 py-2.5">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 break-words font-medium text-[var(--text)]">{l.title}</div>
                  <div className="tabular shrink-0 text-right font-semibold">{money(l.valueMinor)}</div>
                </div>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
                  <Reason l={l} />
                  <span className="tabular">{l.quantity} шт</span>
                  {l.orderShortId && <span>заказ #{l.orderShortId}</span>}
                </div>
                {l.note && <div className="mt-1 break-words text-[12.5px] text-[var(--text-muted)]">{l.note}</div>}
                <div className="mt-1 text-[12px] text-[var(--text-faint)]">
                  {formatDateTime(l.createdAt)}
                  {l.adminName ? ` · ${l.adminName}` : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Reason({ l }: { l: WriteoffLine }) {
  return <Badge tone={l.reason === "DEFECT" ? "danger" : "neutral"}>{WRITEOFF_LABEL[l.reason] ?? l.reason}</Badge>;
}
