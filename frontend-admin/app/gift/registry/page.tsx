"use client";

/**
 * «Реестр подарков» (route "/gift/registry"): every gift handed to a customer in a period — a case
 * prize, the gift for the order sum, an admin's gift — at its usual price, with the person's total
 * for the month against the monthly limit (setting gift.monthlyLimitUah). GET /api/admin/gift/registry.
 * «Скачать CSV» — the same rows in Ukrainian for the accountant (Excel: «;», a comma in amounts).
 */
import { formatMoment, nowMs } from "@shop/core/time";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Download, FileSpreadsheet } from "lucide-react";
import { CASE_TIER_LABEL, GIFT_SOURCE_LABEL, giftApi, type GiftRegistry, type GiftRegistryRow } from "@/lib/gift";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { formatDateTime, shortId, STATUS_LABEL } from "@/lib/orders";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** First and last day of a month (m 0-based). */
function monthSpan(y: number, m: number): [string, string] {
  return [iso(y, m, 1), iso(y, m, new Date(y, m + 1, 0).getDate())];
}

export default function GiftRegistryPage() {
  const now = new Date(nowMs());
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [from, to] = custom ? [custom.from, custom.to] : monthSpan(ym.y, ym.m);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const q = useQuery({
    queryKey: ["gift", "registry", from, to],
    queryFn: () => giftApi.registry(from, to),
    enabled: valid,
  });

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
        {q.data && <Registry data={q.data} />}
      </QueryState>
    </div>
  );
}

function Registry({ data }: { data: GiftRegistry }) {
  const tiles = [
    { label: "Подарков", value: String(data.count) },
    { label: "На сумму", value: money(data.totalMinor) },
    { label: "Людей", value: String(data.people) },
    {
      label: "Сверх лимита",
      value: String(data.overLimit),
      hint: data.limitMinor > 0 ? `лимит ${money(data.limitMinor)} в месяц` : "лимит выключен",
      warn: data.overLimit > 0,
    },
  ];
  return (
    <>
      <div className="mb-4 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card-2 min-w-0 px-3 py-2.5">
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div className={cn("tabular mt-1 break-words font-display text-[18px] font-bold leading-tight", t.warn ? "text-[var(--danger-ink)]" : "text-[var(--ink)]")}>
              {t.value}
            </div>
            {t.hint && <div className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{t.hint}</div>}
          </div>
        ))}
      </div>

      {data.overLimit > 0 && (
        <p className="mb-4 flex items-start gap-2 text-[13px] leading-snug text-[var(--warn)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            У {data.overLimit} {data.overLimit === 1 ? "человека" : "человек"} подарки за месяц дороже лимита — с превышения
            удерживается НДФЛ и военный сбор. Покажите строки бухгалтеру.
          </span>
        </p>
      )}

      {data.rows.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="Подарков за период нет" description="Отменённые заказы и возвращённые подарки сюда не попадают." />
      ) : (
        <>
          <div className="panel hidden min-w-0 overflow-x-auto lg:block">
            <table className="w-full min-w-[60rem] text-[13px]">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[11.5px] text-[var(--text-faint)]">
                  <th className="px-3 py-2 font-semibold">Вручён</th>
                  <th className="px-3 py-2 font-semibold">Заказ</th>
                  <th className="px-3 py-2 font-semibold">Получатель</th>
                  <th className="px-3 py-2 font-semibold">Подарок</th>
                  <th className="px-3 py-2 text-right font-semibold">Стоимость</th>
                  <th className="px-3 py-2 text-right font-semibold">За месяц</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={`${r.orderId}-${i}`} className={cn("border-b border-[var(--line)] last:border-0 align-top", r.overLimit && "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]")}>
                    <td className="px-3 py-2 whitespace-nowrap"><HandedOver r={r} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><OrderCell r={r} /></td>
                    <td className="px-3 py-2"><Person r={r} /></td>
                    <td className="px-3 py-2"><GiftCell r={r} /></td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                      {money(r.valueMinor)}
                      {r.quantity > 1 && <div className="text-[11.5px] text-[var(--text-faint)]">{r.quantity} × {money(r.unitMinor)}</div>}
                    </td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap"><MonthTotal r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid min-w-0 gap-2 lg:hidden">
            {data.rows.map((r, i) => (
              <div key={`${r.orderId}-${i}`} className={cn("card-2 min-w-0 px-3 py-2.5", r.overLimit && "!border-[var(--danger)]")}>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0"><GiftCell r={r} /></div>
                  <div className="tabular shrink-0 text-right font-semibold">{money(r.valueMinor)}</div>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[12.5px]">
                  <Person r={r} />
                  <div className="text-right"><MonthTotal r={r} /></div>
                </div>
                <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-3 text-[12px] text-[var(--text-muted)]">
                  <OrderCell r={r} />
                  <HandedOver r={r} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function HandedOver({ r }: { r: GiftRegistryRow }) {
  return r.deliveredAt ? (
    <span>{formatDateTime(r.deliveredAt)}</span>
  ) : (
    <span className="text-[var(--text-muted)]">не вручён · заказ {formatDateTime(r.createdAt)}</span>
  );
}

function OrderCell({ r }: { r: GiftRegistryRow }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={`/orders/${r.orderId}`} className="font-semibold hover:text-[var(--accent-hi)]">{shortId(r.orderId)}</Link>
      <span className="text-[var(--text-faint)]">{STATUS_LABEL[r.status as keyof typeof STATUS_LABEL] ?? r.status}</span>
    </span>
  );
}

function Person({ r }: { r: GiftRegistryRow }) {
  return (
    <div className="min-w-0">
      <div className="break-words font-semibold">{r.customerName}</div>
      <div className="text-[12px] text-[var(--text-muted)]">
        {r.phone}
        {r.tgUsername ? ` · @${r.tgUsername}` : ""}
      </div>
    </div>
  );
}

function GiftCell({ r }: { r: GiftRegistryRow }) {
  return (
    <div className="min-w-0">
      <div className="break-words">{r.title}{r.variant ? ` · ${r.variant}` : ""}</div>
      <div className="text-[12px] text-[var(--text-faint)]">
        {GIFT_SOURCE_LABEL[r.source] ?? r.source}
        {r.tier ? ` · ${CASE_TIER_LABEL[r.tier]}` : ""}
      </div>
    </div>
  );
}

function MonthTotal({ r }: { r: GiftRegistryRow }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className={cn(r.overLimit && "font-semibold text-[var(--danger-ink)]")}>{money(r.monthTotalMinor)}</span>
      {r.overLimit ? <Badge tone="danger">сверх лимита</Badge> : <span className="text-[11.5px] text-[var(--text-faint)]">за {r.month}</span>}
    </span>
  );
}

// ---- CSV for the accountant (Ukrainian, Excel-friendly) ----

const UK_SOURCE: Record<string, string> = {
  CASE: "Кейс (рекламна акція)",
  THRESHOLD: "Подарунок за суму замовлення",
  ADMIN: "Подарунок від магазину",
};

const UK_STATUS: Record<string, string> = {
  NEW: "Нове",
  APPROVED: "Прийняте",
  SHIPPED: "Відправлене",
  DELIVERED: "Доставлене",
};

/** Kopecks → "1234,56" (no grouping: Excel reads it as a number in the Ukrainian locale). */
const uah = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

/** dd.mm.yyyy in Kyiv. */
const ukDate = (isoTs: string | null) =>
  isoTs ? formatMoment(isoTs, { day: "2-digit", month: "2-digit", year: "numeric" }, "uk-UA", "Europe/Kyiv") : "";

function cell(v: string | number): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(data: GiftRegistry) {
  const head = [
    "Дата вручення",
    "Дата замовлення",
    "Замовлення",
    "Статус",
    "Отримувач (ПІБ)",
    "Телефон",
    "Telegram",
    "Особа",
    "Подарунок",
    "Варіант",
    "Кількість",
    "Ціна за од., грн",
    "Вартість, грн",
    "Джерело",
    "Місяць",
    "Подарунків особі за місяць, грн",
    "Ліміт на місяць, грн",
    "Перевищення ліміту, грн",
  ];
  const limit = data.limitMinor;
  const rows = data.rows.map((r) => [
    ukDate(r.deliveredAt) || "не вручено",
    ukDate(r.createdAt),
    shortId(r.orderId),
    UK_STATUS[r.status] ?? r.status,
    r.customerName,
    r.phone,
    r.tgUsername ? `@${r.tgUsername}` : "",
    r.person,
    r.title,
    r.variant ?? "",
    r.quantity,
    uah(r.unitMinor),
    uah(r.valueMinor),
    UK_SOURCE[r.source] ?? r.source,
    r.month,
    uah(r.monthTotalMinor),
    limit > 0 ? uah(limit) : "",
    limit > 0 && r.monthTotalMinor > limit ? uah(r.monthTotalMinor - limit) : "",
  ]);
  const footer = [
    [],
    ["Період", `${ukDate(data.from + "T12:00:00Z")} – ${ukDate(data.to + "T12:00:00Z")}`],
    ["Подарунків", data.count],
    ["На суму, грн", uah(data.totalMinor)],
    ["Осіб", data.people],
    ["Осіб з перевищенням ліміту", data.overLimit],
  ];
  const text = [head, ...rows, ...footer].map((line) => line.map(cell).join(";")).join("\r\n");
  // BOM: Excel opens UTF-8 with Cyrillic correctly only with it.
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `podarunky_${data.from}_${data.to}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
