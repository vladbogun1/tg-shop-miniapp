"use client";

/**
 * «Списания» (route "/writeoffs"): stock that left the shelf without a sale — defects (from returns and
 * exchanges), inventory counts, mis-sorts, sales outside the site — for a period, valued at the price
 * the loss was counted at. Rows come from lowering stock in the product form (a reason is mandatory)
 * and from returns. GET /api/admin/stock-writeoffs?range=. «Вернуть на склад» puts units written off by
 * mistake back on the shelf (V70); the row stays, marked «вернули N», and drops out of the totals.
 */
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { WriteoffRange } from "../model/types";
import { WRITEOFF_RANGES } from "../model/writeoffs";
import { useWriteoffReport } from "../queries";
import { WriteoffReportView } from "./WriteoffReportView";

export function WriteoffsScreen() {
  const [range, setRange] = useState<WriteoffRange>("month");
  const q = useWriteoffReport(range);

  return (
    <div className="min-w-0">
      <PageHeader
        title="Списания"
        subtitle="Товар, который ушёл с полки без продажи: брак, пересчёт, пересорт, продажа вне сайта."
        actions={<SegmentedControl options={WRITEOFF_RANGES} value={range} onChange={setRange} />}
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка списаний">
        {q.data && <WriteoffReportView data={q.data} />}
      </QueryState>
    </div>
  );
}
