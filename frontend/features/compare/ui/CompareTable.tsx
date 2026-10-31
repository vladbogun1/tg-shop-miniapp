"use client";

/** The comparison table: phone layout (swiped columns + compact bar) and the wide desktop table. */
import { Plus, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { type CompareSection } from "@shop/core/compare";
import { AddToCartControl } from "@/features/cart";
import { useI18n } from "@/i18n/context";
import { type Product } from "@/lib/api";
import { productInStock } from "@shop/customer/catalog/model/stock";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { haptic } from "@/platform/telegram";

const LABEL_W = 180;
const PHONE_MAX = 640;

export function Table({
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

