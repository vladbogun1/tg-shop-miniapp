"use client";

/**
 * Catalog filters (sidebar on desktop, sheet on phones) and the sort dropdown.
 *
 * All state lives in the URL query (`inStock=1`, `priceMax=<₴>`, `sort=…`, `page=…`), so a
 * filtered page can be shared, bookmarked and server-rendered. Changing a filter drops `page`.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition } from "react";
import type { CatalogSort, PublicCategory } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import type { MessageKey } from "@/i18n";
import { useEscape, useScrollLock } from "@/lib/hooks";
import { useFmt } from "@/lib/use-fmt";

const SORTS: CatalogSort[] = ["default", "price_asc", "price_desc", "new", "name"];

function useQueryNav() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, v);
      }
      url.searchParams.delete("page");
      start(() => router.push(url.pathname + (url.search ? url.search : ""), { scroll: false }));
    },
    [router]
  );
  return { set, pending };
}

export function CatalogSortSelect({ value }: { value: CatalogSort }) {
  const { t } = useI18n();
  const id = useId();
  const { set, pending } = useQueryNav();
  return (
    <div className="flex flex-1 items-center gap-2 sm:flex-none">
      <label htmlFor={id} className="nb-up hidden text-[12px] font-black text-[var(--muted)] sm:block">
        {t("catalog.sort")}
      </label>
      <select
        id={id}
        value={value}
        aria-busy={pending}
        onChange={(e) => set({ sort: e.target.value === "default" ? null : e.target.value })}
        className="nb-select h-11 w-full min-w-0 rounded-[var(--r)] border-[3px] border-[var(--line)] pl-3 text-[14px] font-bold text-[var(--ink)] sm:w-[230px]"
      >
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {t(`catalog.sort.${s}` as MessageKey)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CatalogFilters({
  categories,
  activeCategory,
  inStock,
  priceMax,
  priceMaxAvailable,
  hrefs,
  showCategories,
}: {
  categories: PublicCategory[];
  activeCategory: string | null;
  inStock: boolean;
  priceMax?: number;
  priceMaxAvailable: number;
  hrefs: { all: string; category: Record<string, string>; reset: string };
  showCategories: boolean;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const { set } = useQueryNav();
  const priceId = useId();
  const ceiling = Math.max(1, Math.ceil(Math.max(priceMaxAvailable, priceMax ?? 0) / 100));
  const [price, setPrice] = useState<string>(priceMax ? String(Math.round(priceMax / 100)) : "");
  useEffect(() => setPrice(priceMax ? String(Math.round(priceMax / 100)) : ""), [priceMax]);

  function applyPrice(v: string) {
    const n = Math.round(Number(v));
    set({ priceMax: n > 0 && n < ceiling ? String(n) : null });
  }

  return (
    <div className="flex flex-col gap-5">
      {showCategories && (
        <section className="nb p-4">
          <h2 className="nb-up mb-3 text-[12px] font-black text-[var(--faint)]">{t("catalog.categories")}</h2>
          <ul className="flex flex-col gap-1">
            <li>
              <FilterLink href={hrefs.all} active={!activeCategory}>
                {t("catalog.all")}
              </FilterLink>
            </li>
            {categories.map((c) => (
              <li key={c.id}>
                <FilterLink href={hrefs.category[c.slug]} active={activeCategory === c.slug} count={c.productCount}>
                  {c.name}
                </FilterLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="nb flex flex-col gap-4 p-4">
        <h2 className="nb-up text-[12px] font-black text-[var(--faint)]">{t("catalog.filters")}</h2>
        <label className="flex cursor-pointer items-center gap-3 text-[14px] font-bold text-[var(--ink)]">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => set({ inStock: e.target.checked ? "1" : null })}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="grid h-6 w-6 shrink-0 place-items-center rounded-[3px] border-[2.5px] border-[var(--line)] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-[var(--c2)]"
            style={{ background: inStock ? "var(--accent)" : "var(--surface)" }}
          >
            {inStock && <Check className="h-4 w-4 text-[var(--accent-ink)]" strokeWidth={3.5} />}
          </span>
          {t("catalog.inStock")}
        </label>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyPrice(price);
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor={priceId} className="text-[13px] font-extrabold text-[var(--ink)]">
            {t("catalog.priceMax")}
          </label>
          <input
            type="range"
            min={0}
            max={ceiling}
            step={Math.max(1, Math.round(ceiling / 100))}
            value={price ? Math.min(Number(price), ceiling) : ceiling}
            onChange={(e) => setPrice(e.target.value)}
            onPointerUp={(e) => applyPrice((e.target as HTMLInputElement).value)}
            onKeyUp={(e) => {
              if (e.key.startsWith("Arrow")) applyPrice((e.target as HTMLInputElement).value);
            }}
            aria-label={t("catalog.priceMax")}
            className="w-full accent-[var(--accent)]"
          />
          <div className="flex gap-2">
            <input
              id={priceId}
              type="number"
              inputMode="numeric"
              min={0}
              value={price}
              placeholder={String(ceiling)}
              onChange={(e) => setPrice(e.target.value)}
              className="h-10 w-full min-w-0 rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--surface)] px-3 text-[14px] font-bold text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              className="h-10 shrink-0 rounded-[var(--r)] border-[2.5px] border-[var(--line)] bg-[var(--ink)] px-3 text-[12px] font-black uppercase text-[var(--bg)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
            >
              {t("catalog.apply")}
            </button>
          </div>
          {priceMax ? (
            <p className="text-[12px] font-bold text-[var(--muted)]">
              {t("catalog.priceUpTo", { amount: fmt.money(priceMax) })}
            </p>
          ) : null}
        </form>

        {(inStock || !!priceMax) && (
          <Link href={hrefs.reset} className="link-ink text-[13px] font-extrabold text-[var(--ink)]">
            {t("catalog.reset")}
          </Link>
        )}
      </section>
    </div>
  );
}

function FilterLink({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-9 items-center justify-between gap-2 rounded-[var(--r)] border-[2.5px] px-2.5 py-1 text-[14px] font-bold ${
        active
          ? "border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]"
          : "border-transparent text-[var(--ink)] hover:border-[var(--line)] hover:bg-[var(--surface-2)]"
      }`}
    >
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined && <span className="shrink-0 text-[12px] opacity-70">{count}</span>}
    </Link>
  );
}

/** Phone/tablet: a button that opens the same filters in a bottom sheet. */
export function MobileFiltersButton({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useScrollLock(open);
  useEscape(open, close);
  // Following a link inside the sheet navigates; close it then.
  useEffect(() => {
    if (!open) return;
    const h = () => setOpen(false);
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="nb nb-press tap flex h-11 shrink-0 items-center gap-2 px-4 text-[13px] font-black uppercase tracking-wide text-[var(--ink)] lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={2.75} />
        {t("catalog.filters")}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-50 bg-black/50 lg:hidden"
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t("catalog.showFilters")}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              onClickCapture={(e) => {
                if ((e.target as HTMLElement).closest("a")) setOpen(false);
              }}
              className="fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-[var(--r)] border-t-[3px] border-[var(--line)] bg-[var(--bg)] p-4 lg:hidden"
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[18px] font-black uppercase text-[var(--ink)]">{t("catalog.showFilters")}</p>
                <button
                  type="button"
                  onClick={close}
                  aria-label={t("common.close")}
                  className="nb-flat tap grid h-11 w-11 place-items-center text-[var(--ink)]"
                >
                  <X className="h-5 w-5" strokeWidth={3} />
                </button>
              </div>
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
