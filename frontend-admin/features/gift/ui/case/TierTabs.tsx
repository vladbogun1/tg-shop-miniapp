"use client";

import { Settings2 } from "lucide-react";
import { CASE_TIER_METAL, CASE_TIER_ORDER, type CaseTier } from "@shop/core/giftcase";
import { toMinor } from "@shop/core/money";
import { cn } from "@/lib/cn";
import { money } from "@/lib/money";
import { Button } from "@shop/ui/admin-button";
import { Toggle } from "@/components/ui/Toggle";
import { CASE_TIER_LABEL } from "../../model/labels";
import type { GiftTierAdmin, GiftTierPatch } from "../../model/types";

const tierArt = (t: CaseTier) => `/case/${t.toLowerCase()}/case-closed-sm.webp`;

/** Bronze / silver / gold: the threshold, «выключен» / «нет призов», a dot when the tier has an unpublished draft. */
export function TierTabs({
  tier,
  tiers,
  dirtyTiers,
  onSelect,
}: {
  tier: CaseTier;
  tiers: GiftTierAdmin[];
  dirtyTiers: CaseTier[];
  onSelect: (t: CaseTier) => void;
}) {
  return (
    <div role="tablist" aria-label="Кейс" className="grid min-w-0 grid-cols-3 gap-2 lg:max-w-[560px]">
      {CASE_TIER_ORDER.map((t) => {
        const d = tiers.find((x) => x.tier === t);
        const on = t === tier;
        const m = CASE_TIER_METAL[t];
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(t)}
            className={cn(
              "focusable card-2 relative flex min-w-0 flex-col items-center gap-1 px-1.5 pb-2 pt-1.5 text-center transition-[border-color,background] duration-200",
              on ? "!border-[var(--tier)] bg-[color-mix(in_srgb,var(--tier)_10%,var(--surface-2))]" : "hover:bg-[var(--surface-hover)]",
              d && !d.enabled && "opacity-60"
            )}
            style={{ ["--tier" as string]: m.ga }}
          >
            {dirtyTiers.includes(t) && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--accent)]" title="Есть неопубликованный черновик" />
            )}
            <img src={tierArt(t)} alt="" className="h-10 w-[60px] object-contain sm:h-12 sm:w-[72px]" draggable={false} />
            <span className="font-display text-[12.5px] font-bold leading-tight text-[var(--ink)] sm:text-[13.5px]" style={on ? { color: m.ga } : undefined}>
              {CASE_TIER_LABEL[t]}
            </span>
            <span className="tabular text-[11px] leading-tight text-[var(--text-faint)]">
              {d ? (d.enabled ? `от ${money(toMinor(d.thresholdUah))}` : "выключен") : "—"}
            </span>
            {d && d.enabled && d.livePrizes === 0 && (
              <span className="text-[10.5px] font-semibold leading-tight text-[var(--danger-ink)]">нет призов</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** «… кейс разыгрывается» (saved at once) and the button for the tier's threshold, discount and promo settings. */
export function TierSwitch({
  tier,
  enabled,
  pending,
  onToggle,
  onSettings,
}: {
  tier: CaseTier;
  enabled: boolean;
  pending: boolean;
  onToggle: (body: GiftTierPatch, okText: string) => void;
  onSettings: () => void;
}) {
  const name = CASE_TIER_LABEL[tier];
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <Toggle
        checked={enabled}
        disabled={pending}
        onChange={(v) => onToggle({ enabled: v }, v ? `${name} кейс включён` : `${name} кейс выключен`)}
        label={`${name} кейс разыгрывается`}
      />
      <Button size="sm" variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={onSettings}>
        Порог, скидка, промокод
      </Button>
    </div>
  );
}
