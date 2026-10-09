"use client";

/**
 * «Порівняти» — adds/removes a product from the comparison list.
 *   - `icon`: round button in the bottom-right corner of a catalog tile's photo;
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
        className={`tap grid h-10 w-10 place-items-center rounded-full border shadow-[0_6px_16px_-8px_rgba(0,0,0,.9)] transition-colors ${
          inList
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
            : "border-[var(--line-strong)] bg-[rgba(14,14,16,.86)] text-[var(--ink)] hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
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

/**
 * Opens the comparison: ⚖ + count, only while the list is not empty. Phones have no room for it in
 * the header, so it sits in the catalog's sticky «Фільтри · sort» row (`bar`) and as the first item
 * of the burger menu (`menu`); a floating button would cover the tiles' own ⚖ while scrolling.
 */
export function CompareOpenButton({ variant, className = "", onOpen }: { variant: "bar" | "menu"; className?: string; onOpen?: () => void }) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const count = useCompare((s) => s.entries.length);
  const openModal = useCompare((s) => s.openModal);
  if (!hydrated || count === 0) return null;
  const open = () => {
    onOpen?.();
    openModal();
  };
  if (variant === "bar") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={t("compare.headerCount", { n: count })}
        className={`tap relative grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)] ${className}`}
      >
        <Scale className="h-5 w-5" strokeWidth={2.1} />
        <span
          key={count}
          className="cmp-bump absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-ink)]"
        >
          {count}
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      className={`tap flex min-h-[48px] w-full items-center gap-3 rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-left font-display text-[14px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)] ${className}`}
    >
      <Scale className="h-5 w-5 shrink-0" strokeWidth={2.1} />
      <span className="flex-1">{t("compare.title")}</span>
      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[12px] leading-none text-[var(--accent-ink)]">{count}</span>
    </button>
  );
}
