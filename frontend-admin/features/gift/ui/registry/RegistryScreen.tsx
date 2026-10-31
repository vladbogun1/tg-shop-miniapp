"use client";

/**
 * «Реестр подарков» (route "/gift/registry"): every gift handed to a customer in a period — a case
 * prize, the gift for the order sum, an admin's gift — at its usual price, with the person's total
 * for the month against the monthly limit (setting gift.monthlyLimitUah). GET /api/admin/gift/registry.
 * «Скачать CSV» — the same rows in Ukrainian for the accountant (Excel: «;», a comma in amounts).
 */
import { nowMs } from "@shop/core/time";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { isValidSpan, monthSpan } from "../../model/registry";
import { useGiftRegistryQuery } from "../../queries";
import { downloadCsv } from "./download-csv";
import { RegistryView } from "./RegistryView";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export function RegistryScreen() {
  const now = new Date(nowMs());
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [from, to] = custom ? [custom.from, custom.to] : monthSpan(ym.y, ym.m);
  const valid = isValidSpan(from, to);

  const q = useGiftRegistryQuery(from, to, valid);

  const shift = (d: number) => {
    setCustom(null);
    setYm(({ y, m }) => {
      const t = new Date(y, m + d, 1);
      return { y: t.getFullYear(), m: t.getMonth() };
    });
  };
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();

  return (
    <div className="min-w-0">
      <PageHeader
        title="Реестр подарков"
        subtitle="Подарки покупателям по обычной цене и сумма на человека за месяц — для бухгалтера."
        actions={
          <Link
            href="/gift"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Кейс
          </Link>
        }
      />

      <section className="panel mb-4 min-w-0 p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <div className="flex min-w-0 items-center gap-1">
            <Button size="icon" variant="surface" aria-label="Предыдущий месяц" onClick={() => shift(-1)} icon={<ChevronLeft className="h-4 w-4" />} />
            <div className={cn("min-w-[9.5rem] text-center font-display text-[15px] font-bold capitalize", custom && "opacity-40")}>
              {MONTHS[ym.m]} {ym.y}
            </div>
            <Button
              size="icon"
              variant="surface"
              aria-label="Следующий месяц"
              disabled={isCurrent && !custom}
              onClick={() => shift(1)}
              icon={<ChevronRight className="h-4 w-4" />}
            />
          </div>
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:w-[22rem]">
            <Input label="С" type="date" value={from} max={to} onChange={(e) => setCustom({ from: e.target.value, to })} />
            <Input label="По" type="date" value={to} min={from} onChange={(e) => setCustom({ from, to: e.target.value })} />
          </div>
          <Button
            variant="accent"
            icon={<Download className="h-4 w-4" />}
            disabled={!q.data || q.data.rows.length === 0}
            onClick={() => q.data && downloadCsv(q.data)}
          >
            Скачать CSV
          </Button>
        </div>
        {!valid && <p className="mt-2 text-[12.5px] text-[var(--danger-ink)]">Дата «по» раньше даты «с»</p>}
      </section>

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка реестра">
        {q.data && <RegistryView data={q.data} />}
      </QueryState>
    </div>
  );
}
