"use client";

import { BarChart3 } from "lucide-react";
import { CASE_TIER_METAL } from "@shop/core/giftcase";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { CASE_TIER_LABEL } from "../model/labels";
import { useGiftStatsQuery } from "../queries";
import type { GiftStats } from "../model/types";

type Tile = { label: string; value: string; hint?: string };

/** The four tiles of the strip; `s` is undefined while the stats load. */
function tilesOf(s: GiftStats | undefined): Tile[] {
  const share = s && s.orders > 0 ? Math.round((s.giftOrders / s.orders) * 100) : 0;
  const guaranteedMinor = s?.guaranteedMinor ?? 0;
  return [
    { label: "Заказов с подарком", value: s ? `${s.giftOrders} из ${s.orders}` : "—", hint: s ? `${share}% заказов` : undefined },
    { label: "Кейсов открыто", value: s ? `${s.casesOpened} из ${s.caseOrders}` : "—", hint: "покупатель открыл в заказе" },
    {
      label: "Скидка вместо кейса",
      value: s ? String(s.guaranteedOrders ?? 0) : "—",
      hint: s && guaranteedMinor > 0 ? `на ${money(guaranteedMinor)}` : undefined,
    },
    {
      label: "Призов-скидок / замен",
      value: s ? `${s.discountPrizes ?? 0} / ${s.swaps ?? 0}` : "—",
      hint: "выпало скидок / заменено товаров",
    },
  ];
}

/** The last 30 days: gifts, opened cases, discounts instead of a case, per tier. */
export function StatsStrip() {
  const q = useGiftStatsQuery();
  const tiles = tilesOf(q.data);
  const tiers = q.data?.tiers?.filter((t) => t.cases + t.guaranteed > 0) ?? [];
  return (
    <section className="mb-4 min-w-0 lg:mb-6" aria-label="Статистика за 30 дней">
      <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
        <BarChart3 className="h-4 w-4" />
        <span className="field-label">Статистика за 30 дней</span>
        {q.isError && <span className="text-[12px] text-[var(--danger-ink)]">не загрузилась</span>}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card-2 min-w-0 px-3 py-2.5">
            <div className="text-[11.5px] leading-tight text-[var(--text-faint)]">{t.label}</div>
            <div className={cn("tabular mt-1 break-words font-display text-[18px] font-bold leading-tight text-[var(--ink)]", q.isLoading && "opacity-40")}>
              {t.value}
            </div>
            {t.hint && <div className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">{t.hint}</div>}
          </div>
        ))}
      </div>
      {tiers.length > 0 && (
        <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
          {tiers.map((t) => (
            <span key={t.tier} className="tabular">
              <b style={{ color: CASE_TIER_METAL[t.tier].ga }}>{CASE_TIER_LABEL[t.tier]}</b>: кейсов {t.cases}, открыто {t.opened}
              {t.guaranteed > 0 ? `, скидкой ${t.guaranteed}` : ""}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
