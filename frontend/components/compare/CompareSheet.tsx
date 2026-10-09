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
import { Plus, Scale, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  compareGroups,
  compareSections,
  onlyDifferences,
  type CompareBasics,
  type CompareSection,
} from "@shop/shared";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { useI18n } from "@/i18n/context";
import { customerApi, type Product } from "@/lib/api";
import { EMPTY_SCHEMA, productInStock, useCatalogSchema } from "@/lib/catalog";
import { useCompare } from "@/lib/compare";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { backdrop, overlayRise } from "@/lib/motion";
import { haptic, useBackButton } from "@/lib/telegram";

const ONLY_DIFF_KEY = "compare.onlyDiff";
const LABEL_W = 180;
const PHONE_MAX = 640;

export function CompareSheet({ onOpenProduct, onBrowse }: { onOpenProduct: (p: Product) => void; onBrowse: (categorySlug: string | null) => void }) {
  const open = useCompare((s) => s.open);
  const close = useCompare((s) => s.closeScreen);
  useBackButton(open, close);
  // leaving the catalog through the tab bar (cart, account) must not bring the sheet back on return
  useEffect(() => () => useCompare.getState().closeScreen(), []);
  return (
    <AnimatePresence>
      {open && <Body key="cmp" onClose={close} onOpenProduct={onOpenProduct} onBrowse={onBrowse} />}
    </AnimatePresence>
  );
}

function Body({
  onClose,
  onOpenProduct,
  onBrowse,
}: {
  onClose: () => void;
  onOpenProduct: (p: Product) => void;
  onBrowse: (categorySlug: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const entries = useCompare((s) => s.entries);
  const remove = useCompare((s) => s.remove);
  const removeGroup = useCompare((s) => s.removeGroup);
  const prune = useCompare((s) => s.prune);
  const focusGroup = useCompare((s) => s.focusGroup);
  const schemaQ = useCatalogSchema();
  const schema = schemaQ.data ?? EMPTY_SCHEMA;
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

  useEffect(() => {
    if (productsQ.data) prune(new Set(productsQ.data.map((p) => p.id)));
  }, [productsQ.data, prune]);

  const ready = !!productsQ.data && !!schemaQ.data;
  const groups = useMemo(() => (ready ? compareGroups(schema, entries, productsQ.data!) : []), [ready, schema, entries, productsQ.data]);
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
    haptic();
    setOnlyDiff((v) => {
      try {
        localStorage.setItem(ONLY_DIFF_KEY, v ? "0" : "1");
      } catch {
        /* private mode */
      }
      return !v;
    });
  };

  const basics = useMemo<CompareBasics<Product>>(() => {
    const anyUsed = group?.items.some((p) => p.condition && p.condition !== "NEW");
    const condLabel = (c: string | undefined) => schema.conditions.find((x) => x.value === (c ?? "NEW"))?.label ?? null;
    return {
      title: t("compare.basics"),
      rows: [
        { key: "price", label: t("compare.row.price"), value: (p) => money(p.priceMinor, p.currency), rank: (p) => p.priceMinor },
        {
          key: "rating",
          label: t("compare.row.rating"),
          value: (p) => ((p.ratingCount ?? 0) > 0 && p.ratingAvg ? `★ ${p.ratingAvg.toFixed(1)} · ${p.ratingCount}` : null),
          rank: (p) => ((p.ratingCount ?? 0) > 0 ? (p.ratingAvg ?? null) : null),
          higherIsBetter: true,
        },
        { key: "stock", label: t("compare.row.stock"), value: (p) => (productInStock(p) ? t("compare.stock.in") : t("compare.stock.out")) },
        { key: "brand", label: t("compare.row.brand"), value: (p) => p.brandRef?.name ?? null },
        ...(anyUsed ? [{ key: "cond", label: t("compare.row.condition"), value: (p: Product) => condLabel(p.condition) }] : []),
      ],
    };
  }, [group, schema, t]);

  const sections = useMemo(() => {
    if (!group) return [];
    const all = compareSections(schema, group.items, locale, [t("catalog.yes"), t("catalog.no")], basics);
    // one product has no «differences»: the switch is hidden then and the full table shows
    return onlyDiff && group.items.length > 1 ? onlyDifferences(all) : all;
  }, [group, schema, locale, t, basics, onlyDiff]);

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

function Table({
  products,
  sections,
  onRemove,
  onOpenProduct,
  onAddMore,
  emptyNote,
}: {
  products: Product[];
  sections: CompareSection[];
  onRemove: (id: string) => void;
  onOpenProduct: (p: Product) => void;
  onAddMore: () => void;
  emptyNote: string | null;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onScroll = () => setCompact(el.scrollTop > (head.current?.offsetHeight ?? 200) - 24);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const phone = w > 0 && w < PHONE_MAX;
  const labelW = phone ? 0 : LABEL_W;
  const ghost = phone ? products.length < 2 : products.length < 4;
  const cols = products.length + (ghost ? 1 : 0);
  const col = phone ? Math.floor(w / 2) : Math.max(200, Math.min(280, Math.floor((w - labelW) / Math.max(cols, 1))));
  const total = labelW + col * cols;

  return (
    <div
      ref={box}
      className={`no-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain ${phone ? "snap-x snap-mandatory" : ""}`}
      style={{ scrollPaddingLeft: labelW, paddingBottom: "calc(var(--tabbar-h) + var(--safe-bottom) + 28px)" }}
    >
      {w > 0 && (
        <div style={{ width: Math.max(total, w) }}>
          <div ref={head} className="flex border-b border-[var(--line)]">
            {!phone && <Sticky w={labelW} className="bg-[var(--bg)]" />}
            {products.map((p) => (
              <div key={p.id} style={{ width: col }} className="shrink-0 snap-start border-r border-[var(--line)] last:border-r-0">
                <Head product={p} onRemove={onRemove} onOpen={onOpenProduct} />
              </div>
            ))}
            {ghost && (
              <div style={{ width: col }} className="shrink-0 snap-start p-2.5">
                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    onAddMore();
                  }}
                  className="nb-press flex h-full min-h-[200px] w-full flex-col items-center justify-center gap-2 rounded-[var(--r-card)] border border-dashed border-[var(--line-strong)] px-3 text-center text-[var(--muted)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-current">
                    <Plus className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <span className="font-display text-[13px] font-bold uppercase tracking-[.06em]">{t("compare.addMore")}</span>
                  {products.length < 2 && <span className="text-[12px] leading-snug">{t("compare.addMoreHint")}</span>}
                </button>
              </div>
            )}
          </div>

          <div className="sticky top-0 z-30 h-0">
            <div
              aria-hidden={!compact}
              className={`flex border-b border-[var(--line-strong)] shadow-[0_10px_24px_-14px_rgba(0,0,0,.9)] transition-[opacity,transform] duration-200 ${
                compact ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
              }`}
              style={{ background: "rgba(14,14,16,.97)" }}
            >
              {!phone && <Sticky w={labelW} className="bg-[rgba(14,14,16,.97)]" />}
              {products.map((p) => (
                <Mini key={p.id} product={p} width={col} onOpen={onOpenProduct} />
              ))}
            </div>
          </div>

          {emptyNote ? (
            <p className="sticky left-0 px-4 py-10 text-center text-[14px] text-[var(--muted)]" style={{ width: w }}>
              {emptyNote}
            </p>
          ) : (
            sections.map((s) => (
              <section key={s.key}>
                <div className="sticky left-0 z-10 bg-[var(--bg)] px-4 pb-2 pt-5" style={{ width: w }}>
                  <h3 className="font-display text-[10.5px] font-bold uppercase tracking-[.18em] text-[var(--accent)]">{s.label}</h3>
                </div>
                {s.rows.map((r) => (
                  <div key={r.key} className={`border-t border-[var(--line)] ${phone ? "" : "flex"}`}>
                    {phone ? (
                      <div className="sticky left-0 px-4 pt-2.5 text-[12px] font-medium text-[var(--muted)]" style={{ width: w }}>
                        {r.label}
                      </div>
                    ) : (
                      <Sticky w={labelW} className="bg-[var(--bg)] px-4 py-3 text-[13px] text-[var(--muted)]">
                        {r.label}
                      </Sticky>
                    )}
                    <div className="flex">
                      {r.cells.map((c, i) => (
                        <div
                          key={i}
                          style={{ width: col }}
                          className={`shrink-0 border-r border-[var(--line)] px-4 text-[13.5px] font-semibold leading-snug last:border-r-0 [overflow-wrap:anywhere] ${
                            phone ? "pb-2.5 pt-1" : "py-3"
                          } ${c.best ? "text-[var(--ok)]" : r.differs ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}
                        >
                          {c.text ?? <span className="font-normal text-[var(--faint)]">—</span>}
                          {c.best && <span className="sr-only"> ({t("compare.best")})</span>}
                        </div>
                      ))}
                      {ghost && <div style={{ width: col }} className="shrink-0" />}
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Sticky({ w, className = "", children }: { w: number; className?: string; children?: ReactNode }) {
  return (
    <div style={{ width: w }} className={`sticky left-0 z-20 shrink-0 border-r border-[var(--line)] ${className}`}>
      {children}
    </div>
  );
}

function Head({ product: p, onRemove, onOpen }: { product: Product; onRemove: (id: string) => void; onOpen: (p: Product) => void }) {
  const { t } = useI18n();
  const inStock = productInStock(p);
  const hasVariants = (p.variants?.length ?? 0) > 0;
  const open = () => {
    haptic();
    onOpen(p);
  };
  return (
    <div className="relative flex h-full flex-col p-2.5">
      <button
        type="button"
        onClick={() => onRemove(p.id)}
        aria-label={t("compare.remove")}
        className="nb-press absolute right-1.5 top-1.5 z-10 grid h-9 w-9 place-items-center rounded-full border border-[var(--line-strong)] text-[var(--muted)]"
        style={{ background: "rgba(14,14,16,.86)" }}
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <button type="button" onClick={open} className="nb-press flex flex-col text-left">
        <div className="mx-auto aspect-square w-full max-w-[132px] overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
          <Image src={p.images?.[0]?.url} alt={p.title} size={320} className={`h-full w-full ${inStock ? "" : "opacity-60 grayscale-[.85]"}`} />
        </div>
        <h3 className="mt-2 line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-snug text-[var(--ink)]">{p.title}</h3>
      </button>
      <span className="font-display mt-1 text-[16px] font-bold tabular-nums text-[var(--ink)]">{money(p.priceMinor, p.currency)}</span>
      <div className="mt-auto pt-2">
        {hasVariants ? (
          <button
            type="button"
            onClick={open}
            disabled={!inStock}
            className="nb-accent nb-press nb-up flex h-11 w-full items-center justify-center gap-1.5 px-2 text-[13px] disabled:opacity-50"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            {inStock ? t("product.choose") : t("product.outOfStock")}
          </button>
        ) : (
          <AddToCartControl product={p} variant={null} fullWidth size="sm" />
        )}
      </div>
    </div>
  );
}

function Mini({ product: p, width, onOpen }: { product: Product; width: number; onOpen: (p: Product) => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={() => {
        haptic();
        onOpen(p);
      }}
      style={{ width }}
      className="flex shrink-0 items-center gap-2 border-r border-[var(--line)] px-3 py-2 text-left last:border-r-0"
    >
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px] bg-[var(--surface-2)]">
        <Image src={p.images?.[0]?.url} alt="" size={320} className="h-full w-full" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold leading-tight text-[var(--ink)]">{p.title}</p>
        <p className="font-display text-[12.5px] font-bold tabular-nums leading-tight text-[var(--accent-hi)]">{money(p.priceMinor, p.currency)}</p>
      </div>
    </button>
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
