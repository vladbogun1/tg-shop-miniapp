"use client";

/**
 * «Порівняння» in the Mini App — a full-screen overlay like the product view (Telegram's back button
 * closes it). Products come from the catalog query the app already has (["products"]), so opening
 * it costs no request; ids that are not in the catalog any more drop out.
 *
 * Phone layout (the usual one here): two columns fill the width, swiped sideways one column at a
 * time; each characteristic's label sits on its own line above the values and stays put while the
 * columns move. The product heads scroll away and a compact bar of names + prices replaces them.
 * A wide Telegram Desktop window gets the desktop table (sticky label column).
 */
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Scale, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCompareView } from "@shop/customer/compare/use-compare-view";
import { Table } from "./CompareTable";
import { useI18n } from "@/i18n/context";
import { customerApi, type Product } from "@/lib/api";
import { productInStock } from "@shop/customer/catalog/model/stock";
import type { CatalogSchema } from "@shop/core/catalog";
import { useCompare } from "@/features/compare/store";
import { money } from "@/lib/money";
import { backdrop, overlayRise } from "@/lib/motion";
import { haptic, useBackButton } from "@/platform/telegram";

const productPrice = (p: Product) => money(p.priceMinor, p.currency);

export function CompareSheet({ schema, onOpenProduct, onBrowse }: { schema: CatalogSchema | undefined; onOpenProduct: (p: Product) => void; onBrowse: (categorySlug: string | null) => void }) {
  const open = useCompare((s) => s.open);
  const close = useCompare((s) => s.closeScreen);
  useBackButton(open, close);
  return (
    <AnimatePresence>
      {open && <Body key="cmp" schema={schema} onClose={close} onOpenProduct={onOpenProduct} onBrowse={onBrowse} />}
    </AnimatePresence>
  );
}

function Body({
  schema,
  onClose,
  onOpenProduct,
  onBrowse,
}: {
  schema: CatalogSchema | undefined;
  onClose: () => void;
  onOpenProduct: (p: Product) => void;
  onBrowse: (categorySlug: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const entries = useCompare((s) => s.entries);
  const remove = useCompare((s) => s.remove);
  const removeGroup = useCompare((s) => s.removeGroup);
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => customerApi.getProducts() });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // like the product view: the tab bar stays over the sheet (and does not slide away), so the
    // cart is one tap from the comparison; the table scrolls past it
    document.documentElement.setAttribute("data-sheet", "");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-sheet");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const { ready, groups, group, setActive, onlyDiff, toggleDiff, sections } = useCompareView({
    store: useCompare,
    products: productsQ.data,
    schema,
    locale,
    t,
    money: productPrice,
    inStock: productInStock,
    onToggleDiff: haptic,
  });

  const close = () => {
    haptic();
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cmp-title" className="fixed inset-0 z-[68]">
      <motion.div variants={backdrop} initial="initial" animate="animate" exit="exit" className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,.6)" }} />
      <motion.div variants={overlayRise} initial="initial" animate="animate" exit="exit" className="absolute inset-0 flex flex-col" style={{ background: "var(--bg)" }}>
        <header className="shrink-0 border-b border-[var(--line)]" style={{ paddingTop: "var(--safe-top)", background: "rgba(14,14,16,.96)" }}>
          <div className="flex items-center gap-2.5 px-4 pb-2 pt-3">
            <Scale className="h-5 w-5 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
            <h2 id="cmp-title" className="font-display min-w-0 flex-1 truncate text-[20px] font-bold uppercase tracking-[.02em] text-[var(--ink)]">
              {t("compare.title")}
              {entries.length > 0 && <span className="ml-2 text-[14px] font-medium text-[var(--muted)]">{entries.length}</span>}
            </h2>
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={close}
              className="nb-press tap grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--line-strong)] text-[var(--ink)]"
              style={{ background: "rgba(14,14,16,.72)" }}
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>

          {groups.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2" role="tablist">
              {groups.map((g) => {
                const on = g.key === group?.key;
                return (
                  <button
                    key={g.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      haptic();
                      setActive(g.key);
                    }}
                    className={`nb-chip nb-press inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-1 text-[13px] ${on ? "nb-chip-active" : ""}`}
                  >
                    {g.category?.name ?? t("compare.other")}
                    <span className="opacity-70">{g.items.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {group && (
            <div className="flex items-center justify-between gap-2 px-2 pb-1.5">
              {group.items.length > 1 ? <DiffSwitch on={onlyDiff} onToggle={toggleDiff} label={t("compare.onlyDiff")} /> : <span />}
              <ClearButton
                count={group.items.length}
                onClear={() => {
                  haptic();
                  removeGroup(group.key);
                }}
              />
            </div>
          )}
        </header>

        {!ready ? (
          <div className="grid flex-1 place-items-center p-8">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--line-strong)] border-t-[var(--accent)]" aria-label={t("common.loading")} />
          </div>
        ) : !group ? (
          <Empty
            onBrowse={() => {
              onClose();
              onBrowse(null);
            }}
          />
        ) : (
          <>
            {group.items.length > 2 && (
              <p className="shrink-0 border-b border-[var(--line)] px-4 py-1.5 text-center text-[11.5px] text-[var(--muted)]">
                {t("compare.swipeHint", { n: group.items.length })} →
              </p>
            )}
            <Table
              key={group.key}
              products={group.items}
              sections={sections}
              onRemove={(id) => {
                haptic();
                remove(id);
              }}
              onOpenProduct={onOpenProduct}
              onAddMore={() => {
                onClose();
                onBrowse(group.category?.slug ?? null);
              }}
              emptyNote={onlyDiff && group.items.length > 1 && sections.length === 0 ? t("compare.noDiff") : null}
            />
          </>
        )}
      </motion.div>
    </div>
  );
}

function DiffSwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="tap inline-flex min-h-[40px] items-center gap-2.5 rounded-[var(--r)] px-2 text-[13px] font-semibold text-[var(--ink)]">
      <span
        aria-hidden
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors ${on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)] bg-[var(--surface-3)]"}`}
      >
        <span className={`absolute top-[2px] h-4 w-4 rounded-full transition-[left,background-color] duration-200 ${on ? "left-[18px] bg-[var(--accent-ink)]" : "left-[2px] bg-[var(--muted)]"}`} />
      </span>
      {label}
    </button>
  );
}

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
        haptic();
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), 3000);
      }}
      className={`tap inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--r)] px-2.5 text-[13px] font-semibold transition-colors ${
        armed ? "bg-[rgba(239,68,68,.16)] text-[var(--danger)]" : "text-[var(--muted)]"
      }`}
    >
      <Trash2 className="h-4 w-4" strokeWidth={2.25} />
      {armed ? t("compare.clearConfirm", { n: count }) : t("compare.clearGroup")}
    </button>
  );
}

function Empty({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-[320px] text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--accent)]">
          <Scale className="h-8 w-8" strokeWidth={2} />
        </span>
        <h3 className="nb-up mt-4 text-[18px] font-extrabold text-[var(--ink)]">{t("compare.empty.title")}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{t("compare.empty.text")}</p>
        <button type="button" onClick={onBrowse} className="nb-accent nb-press nb-up mt-5 px-6 py-3 text-[14px]">
          {t("common.toCatalog")}
        </button>
      </div>
    </div>
  );
}
