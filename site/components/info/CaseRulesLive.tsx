import { CASE_RARITY_COLOR, caseDiscountText, type CaseRarity, type GiftInfo, type Locale } from "@shop/shared";
import { makeT } from "@/i18n";
import { makeFmt } from "@/lib/format";

/** Everything rarer than «Звичайний» is marked «рідко» — the chances themselves are never published. */
const RARE: ReadonlySet<CaseRarity> = new Set<CaseRarity>(["RARE", "EPIC", "LEGENDARY", "GOLD"]);

/**
 * The live part of the promotion rules (/case-rules): per tier — the order threshold, the guaranteed
 * discount instead of the case, how long a code is valid, the swap, and the gifts in stock now (the
 * rarer ones marked «рідко»). `gift` null = the promotion is off; undefined = the backend did not answer.
 */
export function CaseRulesLive({ locale, gift }: { locale: Locale; gift: GiftInfo | null | undefined }) {
  const t = makeT(locale);
  const fmt = makeFmt(locale);
  const money = (minor: number) => fmt.money(minor);
  const tiers = gift?.kind === "CASE" ? gift.tiers.filter((x) => x.prizes.length) : [];
  if (!tiers.length) {
    return (
      <p className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-4 py-3 text-[14px] font-medium text-[var(--ink)]">
        {gift === undefined ? t("caseRules.error") : t("caseRules.off")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {tiers.map((tier) => (
        <section key={tier.tier} className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <h3 className="font-display text-[16px] font-bold leading-snug text-[var(--ink)]">
            {t("caseRules.tierHead", { tier: t(`case.tier.${tier.tier}` as "case.tier.GOLD"), amount: money(tier.thresholdMinor) })}
          </h3>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px] leading-snug text-[var(--muted)]">
            {tier.guaranteedPercent > 0 && (
              <li>
                {tier.guaranteedMaxMinor > 0
                  ? t("caseRules.guaranteedCap", { percent: tier.guaranteedPercent, amount: money(tier.guaranteedMaxMinor) })
                  : t("caseRules.guaranteed", { percent: tier.guaranteedPercent })}
              </li>
            )}
            {!!tier.promoValidDays && <li>{t("caseRules.promoDays", { n: tier.promoValidDays })}</li>}
            {tier.swap && !!tier.swapPercent && <li>{t("caseRules.swap", { percent: tier.swapPercent })}</li>}
          </ul>
          <h4 className="mt-3 text-[12px] font-bold uppercase tracking-[.12em] text-[var(--muted)]">{t("caseRules.gifts")}</h4>
          <ul className="mt-1.5 flex flex-col divide-y divide-[var(--line)]">
            {tier.prizes.map((p) => (
              <li key={p.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-[14px]">
                <span className="min-w-0 flex-1 basis-48 font-medium text-[var(--ink)] [overflow-wrap:anywhere]">
                  {p.kind === "DISCOUNT" ? t("caseRules.discount", { d: caseDiscountText(p, money) }) : p.title}
                  {p.kind === "PRODUCT" && p.priceMinor > 0 && (
                    <span className="text-[var(--muted)]"> · {t("caseRules.price", { amount: money(p.priceMinor) })}</span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] font-semibold" style={{ color: CASE_RARITY_COLOR[p.rarity] }}>
                  {t(`case.rarity.${p.rarity}` as "case.rarity.GOLD")}
                  {RARE.has(p.rarity) && <span className="text-[var(--muted)]"> · {t("caseRules.rare")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-[12px] font-medium text-[var(--muted)]">{t("caseRules.note")}</p>
    </div>
  );
}
