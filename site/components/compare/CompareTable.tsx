"use client";

/**
 * The comparison table: one column per product, rows grouped like the «Характеристики» block.
 *
 * One scroll box scrolls both ways, so the columns and their rows can never drift apart:
 *   - wide screens: the labels are a sticky left column (200 px), columns 210–300 px;
 *   - phones: two columns fill the width exactly, the label sits on its own line ABOVE the values and
 *     stays put while the columns are swiped sideways (snap per column) — the usual phone pattern of
 *     big shops, so a 5-word label never squeezes the values into a 60 px strip.
 * The product heads (photo, title, price, «В кошик») scroll away with the page; a compact bar with
 * the titles and prices takes their place at the top once they are gone, so a column never loses
 * its name.
 */
import { Plus, ShoppingBag, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CompareSection, StorefrontProduct } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { trackAddToCart } from "@/lib/analytics";
import { stockOf, useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { discountPercent } from "@/lib/format";
import { useFmt } from "@/lib/use-fmt";
import { toast } from "@/components/ui/Toast";

const LABEL_W = 200;
const PHONE_MAX = 640;

export function CompareTable({
  products,
  sections,
  onRemove,
  addMoreHref,
  onNavigate,
  emptyNote,
}: {
  products: StorefrontProduct[];
  sections: CompareSection[];
  onRemove: (id: string) => void;
  /** Category page to add more from; shown as a ghost column while there is room. */
  addMoreHref: string | null;
  /** A link inside the table was followed (the modal closes). */
  onNavigate: () => void;
  /** Shown instead of rows when there is nothing (left) to show, e.g. «only differences» of twins. */
  emptyNote?: string | null;
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
  const ghost = !!addMoreHref && (phone ? products.length < 2 : products.length < 4);
  const cols = products.length + (ghost ? 1 : 0);
  const col = phone ? Math.floor(w / 2) : Math.max(210, Math.min(300, Math.floor((w - labelW) / Math.max(cols, 1))));
  const total = labelW + col * cols;

  return (
    <div
      ref={box}
      className={`no-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-contain ${phone ? "snap-x snap-mandatory" : ""}`}
      style={{ scrollPaddingLeft: labelW }}
    >
      {w > 0 && (
        <div style={{ width: Math.max(total, w) }} className="pb-10">
          {/* product heads */}
          <div ref={head} className="flex border-b border-[var(--line)]">
            {!phone && <Sticky w={labelW} className="bg-[var(--bg)]" />}
            {products.map((p) => (
              <div key={p.id} style={{ width: col }} className="shrink-0 snap-start border-r border-[var(--line)] last:border-r-0">
                <ProductHead product={p} onRemove={onRemove} onNavigate={onNavigate} phone={phone} />
              </div>
            ))}
            {ghost && (
              <div style={{ width: col }} className="shrink-0 snap-start p-3">
                <Link
                  href={addMoreHref!}
                  onClick={onNavigate}
                  className="tap flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-[var(--r-card)] border border-dashed border-[var(--line-strong)] px-3 text-center text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-current">
                    <Plus className="h-5 w-5" strokeWidth={2.25} />
                  </span>
                  <span className="font-display text-[13px] font-bold uppercase tracking-[.06em]">{t("compare.addMore")}</span>
                  {products.length < 2 && <span className="text-[12px] leading-snug">{t("compare.addMoreHint")}</span>}
                </Link>
              </div>
            )}
          </div>

          {/* compact names once the heads are scrolled away (zero-height sticky anchor) */}
          <div className="sticky top-0 z-30 h-0">
            <div
              aria-hidden={!compact}
              className={`flex border-b border-[var(--line-strong)] bg-[rgba(14,14,16,.96)] shadow-[0_10px_24px_-14px_rgba(0,0,0,.9)] transition-[opacity,transform] duration-200 ${
                compact ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
              }`}
            >
              {!phone && <Sticky w={labelW} className="bg-[rgba(14,14,16,.96)]" />}
              {products.map((p) => (
                <MiniHead key={p.id} product={p} width={col} onNavigate={onNavigate} />
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
                  <h3 className="font-display text-[11px] font-bold uppercase tracking-[.18em] text-[var(--accent)]">{s.label}</h3>
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

function ProductHead({
  product: p,
  onRemove,
  onNavigate,
  phone,
}: {
  product: StorefrontProduct;
  onRemove: (id: string) => void;
  onNavigate: () => void;
  phone: boolean;
}) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const add = useCart((s) => s.add);
  const url = href(`/product/${p.slug}`);
  const stock = stockOf(p, null);
  const hasVariants = (p.variants?.length ?? 0) > 0;
  const off = discountPercent(p.priceMinor, p.compareAtMinor);
  const image = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];

  return (
    <div className="relative flex h-full flex-col p-3">
      <button
        type="button"
        onClick={() => onRemove(p.id)}
        aria-label={t("compare.remove")}
        title={t("compare.remove")}
        className="tap absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded-full border border-[var(--line-strong)] bg-[rgba(14,14,16,.86)] text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <Link href={url} onClick={onNavigate} className="group flex flex-col">
        <div className={`mx-auto aspect-square w-full overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)] ${phone ? "max-w-[128px]" : "max-w-[168px]"} ${stock > 0 ? "" : "[&_img]:grayscale-[.85] [&_img]:opacity-60"}`}>
          <Image src={image?.url} alt={p.title} size={320} className="h-full w-full" imgClassName="group-hover:scale-[1.04]" />
        </div>
        <h3 className="mt-2.5 line-clamp-2 min-h-[2.7em] text-[13px] font-semibold leading-snug text-[var(--ink)] transition-colors group-hover:text-[var(--accent-hi)]">
          {p.title}
        </h3>
      </Link>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[17px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(p.priceMinor, p.currency)}</span>
        {off > 0 && <s className="font-display text-[12px] tabular-nums text-[var(--faint)]">{fmt.money(p.compareAtMinor, p.currency)}</s>}
      </div>
      <div className="mt-auto pt-2.5">
        {hasVariants || stock <= 0 ? (
          <Link
            href={url}
            onClick={onNavigate}
            className={`tap flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-2 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface-3)] ${stock > 0 ? "" : "text-[var(--muted)] opacity-70"}`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            {stock > 0 ? t("product.choose") : t("product.outOfStock")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              add(p, null, 1);
              trackAddToCart(p.id, null, 1);
              toast(t("product.added"));
            }}
            className="nb-press tap flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-[var(--r)] border border-[rgba(255,102,0,.55)] bg-[var(--accent-soft)] px-2 text-[12px] font-bold text-[var(--accent-hi)] hover:border-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            {t("product.addToCart")}
          </button>
        )}
      </div>
    </div>
  );
}

function MiniHead({ product: p, width, onNavigate }: { product: StorefrontProduct; width: number; onNavigate: () => void }) {
  const fmt = useFmt();
  const { href } = useI18n();
  const image = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  return (
    <Link
      href={href(`/product/${p.slug}`)}
      onClick={onNavigate}
      tabIndex={-1}
      style={{ width }}
      className="group flex shrink-0 items-center gap-2 border-r border-[var(--line)] px-3 py-2 last:border-r-0"
    >
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px] bg-[var(--surface-2)]">
        <Image src={image?.url} alt="" size={320} className="h-full w-full" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-semibold leading-tight text-[var(--ink)] group-hover:text-[var(--accent-hi)]">{p.title}</p>
        <p className="font-display text-[12.5px] font-bold tabular-nums leading-tight text-[var(--accent-hi)]">{fmt.money(p.priceMinor, p.currency)}</p>
      </div>
    </Link>
  );
}
