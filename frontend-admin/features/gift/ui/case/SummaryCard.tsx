"use client";

import { AlertTriangle } from "lucide-react";
import { CASE_RARITY_COLOR, type CaseRarity } from "@shop/core/giftcase";
import { money } from "@/lib/money";
import { fmtPct, type Summary } from "../../model/case-draft";
import { CASE_RARITY_LABEL } from "../../model/labels";
import type { GiftTierAdmin } from "../../model/types";

/** Chances by rarity and what the case costs against the margin on an order at the threshold. */
export function SummaryCard({ t, sum, warnings }: { t: GiftTierAdmin | null; sum: Summary; warnings: string[] }) {
  const costTone = sum.costShare <= 70 ? "var(--ok,#3ecf8e)" : sum.costShare <= 100 ? "var(--warn)" : "var(--danger-ink)";
  const shares = (Object.entries(sum.share) as [CaseRarity, number][]).filter(([, v]) => v > 0);
  const notes = [
    ...warnings,
    ...sum.shortStock.map((r) => `${r.title}: ≈ ${fmtPct(sum.perMonth.get(r.key) ?? 0, 1)} в месяц, на складе ${r.stock}`),
  ];
  return (
    <div className="card-2 min-w-0 p-3">
      <div className="field-label">Шансы по редкостям</div>
      <div className="mt-2 flex h-3 min-w-0 overflow-hidden rounded-full bg-[var(--surface-3)]" role="img" aria-label="Шансы по редкостям">
        {shares.map(([r, v]) => (
          <span key={r} style={{ width: `${Math.max(v, 0.8)}%`, background: CASE_RARITY_COLOR[r] }} title={`${CASE_RARITY_LABEL[r]}: ${fmtPct(v)} %`} />
        ))}
      </div>
      <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--text-muted)]">
        {shares.map(([r, v]) => (
          <span key={r} className="tabular inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: CASE_RARITY_COLOR[r] }} aria-hidden />
            {fmtPct(v, 1)} %
          </span>
        ))}
        {shares.length === 0 && <span>нечему выпадать</span>}
      </div>

      <dl className="mt-3 grid min-w-0 grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
        <dt className="text-[var(--text-muted)]">Средний приз</dt>
        <dd className="tabular text-right font-semibold text-[var(--text)]">{money(Math.round(sum.avgPrizeMinor / 100) * 100)}</dd>
        <dt className="text-[var(--text-muted)]">Кейс обходится в</dt>
        <dd className="tabular text-right font-bold" style={{ color: costTone }}>
          ≈ {money(Math.round(sum.avgCostMinor / 100) * 100)}
        </dd>
        <dt className="text-[var(--text-muted)]">Маржа с заказа на пороге</dt>
        <dd className="tabular text-right text-[var(--text)]">{money(Math.round(sum.marginMinor / 100) * 100)}</dd>
        <dt className="text-[var(--text-muted)]">Доля маржи на кейс</dt>
        <dd className="tabular text-right font-semibold" style={{ color: costTone }}>
          {fmtPct(sum.costShare, 0)} %
        </dd>
        {sum.guaranteedMinor > 0 && (
          <>
            <dt className="text-[var(--text-muted)]">Скидка вместо кейса</dt>
            <dd className="tabular text-right text-[var(--text)]">{money(sum.guaranteedMinor)}</dd>
          </>
        )}
        <dt className="text-[var(--text-muted)]">Кейсов в месяц</dt>
        <dd className="tabular text-right text-[var(--text)]">≈ {fmtPct(sum.monthly, 1)}</dd>
      </dl>
      <p className="mt-2 text-[11px] leading-snug text-[var(--text-faint)]">
        Себестоимость нет — считаю товар-приз по цене минус средняя маржа {t?.marginPercent ?? 15} %, скидку — полной суммой. Кейсов в месяц — по
        заказам этого уровня за 90 дней.
      </p>
      {sum.guaranteedMinor > 0 && sum.avgCostMinor > 0 && (
        <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
          {sum.guaranteedMinor > sum.avgCostMinor
            ? "Гарантированная скидка дороже кейса — выбравшие скидку обходятся дороже."
            : "Кейс дороже гарантированной скидки — кейс заметно привлекательнее."}
        </p>
      )}
      {notes.length > 0 && (
        <ul className="mt-2.5 flex min-w-0 flex-col gap-1 border-t border-[var(--line)] pt-2.5">
          {notes.map((w, i) => (
            <li key={i} className="flex min-w-0 items-start gap-1.5 text-[12px] leading-snug text-[var(--warn)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
