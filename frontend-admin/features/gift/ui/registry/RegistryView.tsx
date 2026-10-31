"use client";

/** The period's numbers, the over-limit warning and the gifts: a table on a desktop, cards on a phone. */
import Link from "next/link";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { formatDateTime, shortId, STATUS_LABEL } from "@/lib/orders";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CASE_TIER_LABEL, GIFT_SOURCE_LABEL } from "../../model/labels";
import type { GiftRegistry, GiftRegistryRow } from "../../model/types";

export function RegistryView({ data }: { data: GiftRegistry }) {
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
