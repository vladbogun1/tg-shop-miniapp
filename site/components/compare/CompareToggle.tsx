"use client";

/**
 * «Порівняти» — adds/removes a product from the comparison list.
 *   - `icon`: square button next to «В кошик» on a catalog tile;
 *   - `full`: wide secondary button on the product page; once added it says how many are in the
 *     group and opens the comparison.
 */
import { Check, Scale } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { toggleCompare, useCompare, useInCompare } from "@/lib/compare";
import { useHydrated } from "@/lib/hooks";

export function CompareToggle({ productId, group, variant = "icon" }: { productId: string; group: string; variant?: "icon" | "full" }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const inList = useInCompare(productId) && hydrated;
  const groupCount = useCompare((s) => s.entries.filter((e) => e.group === group).length);
  const openModal = useCompare((s) => s.openModal);

  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-pressed={inList}
        aria-label={inList ? t("compare.remove") : t("compare.add")}
        title={inList ? t("compare.remove") : t("compare.add")}
        onClick={() => toggleCompare(productId, group, t)}
        className={`tap grid min-h-[42px] w-[42px] shrink-0 place-items-center rounded-[var(--r)] border transition-colors ${
          inList
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
            : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[rgba(255,255,255,.28)] hover:text-[var(--ink)]"
        }`}
      >
        {inList ? <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> : <Scale className="h-[18px] w-[18px]" strokeWidth={2.1} />}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={inList}
        onClick={() => toggleCompare(productId, group, t)}
        className={`tap inline-flex min-h-[44px] items-center gap-2 rounded-[var(--r)] border px-4 font-display text-[13px] font-semibold uppercase tracking-[.06em] transition-colors ${
          inList
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
            : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] hover:border-[rgba(255,255,255,.3)]"
        }`}
      >
        {inList ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Scale className="h-4 w-4" strokeWidth={2.1} />}
        {inList ? t("compare.inList") : t("compare.add")}
      </button>
      {inList && groupCount > 0 && (
        <button
          type="button"
          onClick={() => openModal(group)}
          className="tap inline-flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-2 font-display text-[13px] font-semibold uppercase tracking-[.06em] text-[var(--accent-hi)] underline-offset-4 hover:underline"
        >
          {t("compare.openN", { n: groupCount })} →
        </button>
      )}
    </div>
  );
}
