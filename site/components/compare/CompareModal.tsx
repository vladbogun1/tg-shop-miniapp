"use client";

/**
 * «Порівняння» on the website: a large centered modal on desktop, a full-screen sheet on phones.
 * Opened from the header button, the toast after adding, the product page and a shared link
 * (`?compare=slug1,slug2` on any page — the products are added and the modal opens).
 *
 * Data: the whole public catalog in light items (`all=1&view=card`, the same request the catalog
 * pages make) + the schema, loaded only when the modal opens; the stored ids are matched against
 * it, so prices and stock are always current and products that left the catalog drop out.
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Link2, Loader2, Scale, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareGroupOf,
  compareGroups,
  compareSections,
  noFadeFlash,
  onlyDifferences,
  type CompareBasics,
  type StorefrontProduct,
} from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { trackCompare } from "@/lib/analytics";
import { useCompare } from "@/lib/compare";
import { copyText, useEscape, useScrollLock } from "@/lib/hooks";
import { useFmt } from "@/lib/use-fmt";
import { stockOf } from "@/lib/stock";
import { toast } from "@/components/ui/Toast";
import { CompareTable } from "./CompareTable";

const ONLY_DIFF_KEY = "compare.onlyDiff";

export function CompareModal() {
  const open = useCompare((s) => s.open);
  const close = useCompare((s) => s.closeModal);
  useScrollLock(open);
  useEscape(open, close);
  useSharedLink();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cmp-backdrop"
            {...noFadeFlash}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-[6px]"
            aria-hidden
          />
          <motion.div
            key="cmp-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cmp-title"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[var(--bg)] md:inset-x-6 md:inset-y-[4vh] md:mx-auto md:max-w-[1240px] md:rounded-[16px] md:border md:border-[var(--line-strong)] md:shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)]"
          >
            <Body onClose={close} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const { t, locale, href } = useI18n();
  const fmt = useFmt();
  const entries = useCompare((s) => s.entries);
  const remove = useCompare((s) => s.remove);
  const removeGroup = useCompare((s) => s.removeGroup);
  const prune = useCompare((s) => s.prune);
  const focusGroup = useCompare((s) => s.focusGroup);

  const products = useQuery({ queryKey: ["compare-cards", locale], queryFn: () => api.allCards(), staleTime: 60_000 });
  const schema = useQuery({ queryKey: ["catalog-schema", locale], queryFn: () => api.catalogSchema(), staleTime: 5 * 60_000 });
  const ready = !!products.data && !!schema.data;

  // stored ids that are not in the catalog any more are dropped (once the list is known)
  useEffect(() => {
    if (products.data) prune(new Set(products.data.items.map((p) => p.id)));
  }, [products.data, prune]);

  useEffect(() => {
    trackCompare("compare_open", undefined, useCompare.getState().entries.length);
  }, []);

  const groups = useMemo(
    () => (ready ? compareGroups(schema.data!, entries, products.data!.items) : []),
    [ready, schema.data, entries, products.data],
  );

  const [active, setActive] = useState<string | null>(focusGroup);
  const group = groups.find((g) => g.key === active) ?? groups[0] ?? null;

  const [onlyDiff, setOnlyDiff] = useState(false);
  useEffect(() => {
    try {
      setOnlyDiff(localStorage.getItem(ONLY_DIFF_KEY) === "1");
    } catch {
      /* private mode */
    }
  }, []);
  const toggleDiff = () => {
    setOnlyDiff((v) => {
      try {
        localStorage.setItem(ONLY_DIFF_KEY, v ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !v;
    });
  };

  const basics = useMemo<CompareBasics<StorefrontProduct>>(() => {
    const anyUsed = group?.items.some((p) => p.condition && p.condition !== "NEW");
    const condLabel = (c: string | undefined) => schema.data?.conditions.find((x) => x.value === (c ?? "NEW"))?.label ?? null;
    return {
      title: t("compare.basics"),
      rows: [
        { key: "price", label: t("compare.row.price"), value: (p) => fmt.money(p.priceMinor, p.currency), rank: (p) => p.priceMinor },
        {
          key: "rating",
          label: t("compare.row.rating"),
          value: (p) => ((p.ratingCount ?? 0) > 0 && p.ratingAvg ? `★ ${p.ratingAvg.toFixed(1)} · ${p.ratingCount}` : null),
          rank: (p) => ((p.ratingCount ?? 0) > 0 ? (p.ratingAvg ?? null) : null),
          higherIsBetter: true,
        },
        { key: "stock", label: t("compare.row.stock"), value: (p) => (stockOf(p, null) > 0 ? t("compare.stock.in") : t("compare.stock.out")) },
        { key: "brand", label: t("compare.row.brand"), value: (p) => p.brandRef?.name ?? null },
        ...(anyUsed ? [{ key: "cond", label: t("compare.row.condition"), value: (p: StorefrontProduct) => condLabel(p.condition) }] : []),
      ],
    };
  }, [group, schema.data, t, fmt]);

  const sections = useMemo(() => {
    if (!group || !schema.data) return [];
    const all = compareSections(schema.data, group.items, locale, [t("catalog.yes"), t("catalog.no")], basics);
    // one product has no «differences»: the switch is hidden then and the full table shows
    return onlyDiff && group.items.length > 1 ? onlyDifferences(all) : all;
  }, [group, schema.data, locale, t, basics, onlyDiff]);

  const total = entries.length;
  const addMoreHref = group?.category ? href(`/catalog/${group.category.slug}`) : href("/catalog");

  const share = async () => {
    if (!group) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("compare", group.items.map((p) => p.slug).join(","));
    if (await copyText(url.toString())) toast(t("compare.linkCopied"));
  };

  return (
    <>
      <header className="shrink-0 border-b border-[var(--line)] bg-[var(--surface)] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-4 py-3">
          <Scale className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
          <h2 id="cmp-title" className="min-w-0 flex-1 truncate font-display text-[20px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
            {t("compare.title")}
            {total > 0 && <span className="ml-2 text-[14px] font-medium text-[var(--muted)]">{total}</span>}
          </h2>
          {(products.isFetching || schema.isFetching) && <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" aria-hidden />}
          {group && group.items.length > 1 && (
            <button
              type="button"
              onClick={share}
              className="tap hidden h-11 items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 font-display text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] sm:inline-flex"
            >
              <Link2 className="h-4 w-4" strokeWidth={2.25} />
              {t("compare.share")}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label={t("common.close")}
            className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)]"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3">
            {groups.length > 1 && (
              <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:flex-1 sm:px-0" role="tablist">
                {groups.map((g) => {
                  const on = g.key === group?.key;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActive(g.key)}
                      className={`tap inline-flex min-h-[38px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 font-display text-[13px] font-semibold transition-colors ${
                        on
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                          : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[rgba(255,255,255,.3)]"
                      }`}
                    >
                      {g.category?.name ?? t("compare.other")}
                      <span className={on ? "text-[var(--accent-hi)]" : "text-[var(--muted)]"}>{g.items.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="ml-auto flex items-center gap-1">
              {group && group.items.length > 1 && <DiffSwitch on={onlyDiff} onToggle={toggleDiff} label={t("compare.onlyDiff")} />}
              {group && <ClearButton count={group.items.length} onClear={() => removeGroup(group.key)} />}
            </div>
          </div>
        )}
      </header>

      {!ready ? (
        <div className="grid flex-1 place-items-center p-8 text-[var(--muted)]">
          {products.isError || schema.isError ? (
            <div className="text-center">
              <p className="text-[14px]">{t("compare.error")}</p>
              <button
                type="button"
                onClick={() => {
                  void products.refetch();
                  void schema.refetch();
                }}
                className="tap mt-3 rounded-[var(--r)] border border-[var(--line-strong)] px-4 py-2 font-display text-[13px] font-semibold uppercase"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin" aria-label={t("common.loading")} />
          )}
        </div>
      ) : !group ? (
        <Empty onClose={onClose} />
      ) : (
        <>
          {group.items.length > 2 && (
            <p className="shrink-0 border-b border-[var(--line)] px-4 py-1.5 text-center text-[11.5px] text-[var(--muted)] sm:hidden">
              {t("compare.swipeHint", { n: group.items.length })} →
            </p>
          )}
          <CompareTable
            key={group.key}
            products={group.items}
            sections={sections}
            onRemove={remove}
            addMoreHref={addMoreHref}
            onNavigate={onClose}
            emptyNote={onlyDiff && group.items.length > 1 && sections.length === 0 ? t("compare.noDiff") : null}
          />
        </>
      )}
    </>
  );
}

function DiffSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="tap inline-flex min-h-[40px] items-center gap-2.5 rounded-[var(--r)] px-2.5 text-[13px] font-semibold text-[var(--ink)]"
    >
      <span
        aria-hidden
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors ${
          on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)] bg-[var(--surface-3)]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-4 w-4 rounded-full transition-[left,background-color] duration-200 ${on ? "left-[18px] bg-[var(--accent-ink)]" : "left-[2px] bg-[var(--muted)]"}`}
        />
      </span>
      {label}
    </button>
  );
}

/** Two-step «Очистити»: the first press asks, the second (within 3 s) clears the group. */
function ClearButton({ count, onClear }: { count: number; onClear: () => void }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          window.clearTimeout(timer.current);
          setArmed(false);
          onClear();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3000);
      }}
      className={`tap inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--r)] px-2.5 text-[13px] font-semibold transition-colors ${
        armed ? "bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] text-[var(--danger)]" : "text-[var(--muted)] hover:text-[var(--danger)]"
      }`}
    >
      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
      {armed ? t("compare.clearConfirm", { n: count }) : t("compare.clearGroup")}
    </button>
  );
}

function Empty({ onClose }: { onClose: () => void }) {
  const { t, href } = useI18n();
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-[360px] text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
          <Scale className="h-8 w-8" strokeWidth={2} />
        </span>
        <h3 className="mt-4 font-display text-[18px] font-extrabold uppercase text-[var(--ink)]">{t("compare.empty.title")}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">{t("compare.empty.text")}</p>
        <a
          href={href("/catalog")}
          onClick={onClose}
          className="tap mt-5 inline-flex min-h-[44px] items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] px-5 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]"
        >
          {t("common.toCatalog")}
        </a>
      </div>
    </div>
  );
}

/**
 * `?compare=slug1,slug2` on any page: once the catalog is known, those products are added to the
 * list and the comparison opens; the parameter is removed from the address right away so a reload
 * does not add them again.
 */
function useSharedLink() {
  const [slugs, setSlugs] = useState<string[] | null>(null);
  const { locale } = useI18n();
  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("compare");
    if (!raw) return;
    setSlugs(raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12));
    url.searchParams.delete("compare");
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const products = useQuery({ queryKey: ["compare-cards", locale], queryFn: () => api.allCards(), staleTime: 60_000, enabled: !!slugs });
  const schema = useQuery({ queryKey: ["catalog-schema", locale], queryFn: () => api.catalogSchema(), staleTime: 5 * 60_000, enabled: !!slugs });

  useEffect(() => {
    if (!slugs || !products.data || !schema.data) return;
    const st = useCompare.getState();
    let group: string | null = null;
    for (const slug of slugs) {
      const p = products.data.items.find((x) => x.slug === slug);
      if (!p) continue;
      group = compareGroupOf(schema.data, p.categoryId);
      st.add(p.id, group);
    }
    setSlugs(null);
    if (group) st.openModal(group);
  }, [slugs, products.data, schema.data]);
}
