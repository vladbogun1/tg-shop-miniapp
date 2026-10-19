"use client";

/**
 * «Разом дешевше» in the cart (page and drawer): the totals block that follows the server quote
 * (bundle OR promo — one of them) and «Докинь до замовлення»
 * suggestions with one-click add. The quote itself comes from `useBundleQuote` in the parent.
 */
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { bundleGroup, type BundleOfferItem, type BundleQuote, type Product, type StorefrontProduct } from "@shop/shared";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/context";
import { trackAddToCart, trackBundle, visitorId } from "@/lib/analytics";
import { stockOf, useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

type Place = "cart" | "drawer";

function firstImage(p: Product): string | null {
  const imgs = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return imgs[0]?.url ?? null;
}

function slugOf(p: Product): string {
  return (p as Partial<StorefrontProduct>).slug || p.id;
}

/**
 * Sum / discount / total. While the quote is loading (or failed) the old local numbers are shown:
 * the subtotal minus the promo preview.
 */
export function CartTotals({
  subtotal,
  promoDiscount,
  quote,
  compact = false,
}: {
  subtotal: number;
  promoDiscount: number;
  quote: BundleQuote | null;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const promoCode = useCart((s) => s.promoCode).trim();
  const kind = quote ? quote.discountKind : promoDiscount > 0 ? "PROMO" : null;
  const discount = quote ? quote.discountMinor : promoDiscount;
  const total = quote ? quote.totalMinor : Math.max(0, subtotal - promoDiscount);
  const sum = quote ? quote.subtotalMinor : subtotal;
  const both = !!quote && quote.bundleDiscountMinor > 0 && promoDiscount > 0;

  return (
    <div className="flex flex-col gap-1">
      {kind && discount > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[var(--muted)]">
            <span>{t("checkout.sum")}</span>
            <span className="font-display tabular-nums text-[var(--ink)]">{fmt.money(sum)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[var(--muted)]">
            <span className="min-w-0 truncate">
              {kind === "BUNDLE"
                ? t("bundle.title")
                : promoCode
                  ? t("checkout.discountWithCode", { code: promoCode })
                  : t("checkout.discount")}
            </span>
            <span className="shrink-0 font-display font-bold tabular-nums text-[var(--ok)]">−{fmt.money(discount)}</span>
          </div>
          {both && <p className="text-[11px] font-medium leading-snug text-[var(--faint)]">{t("bundle.notStack")}</p>}
        </>
      )}
      <div className={`flex items-center justify-between ${kind && discount > 0 ? "mt-1" : ""}`}>
        <span className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("cart.total")}</span>
        <span className={`font-display ${compact ? "text-[20px]" : "text-[22px]"} font-bold tabular-nums text-[var(--accent)]`}>
          {fmt.money(total)}
        </span>
      </div>
    </div>
  );
}

/**
 * «Докинь до замовлення» (2.0): one line — the best accessory for what is in the cart, one click to
 * add. With `offers` (2.0 server) the percent is capped by the item's margin cap and the control
 * group (`holdoutPercent`) does not see the line.
 */
export function BundleSuggestions({
  suggestions,
  offers,
  holdoutPercent,
  nextPercent,
  place,
  max = 1,
  onNavigate,
}: {
  suggestions: Product[] | undefined;
  offers?: BundleOfferItem[];
  holdoutPercent?: number;
  nextPercent: number;
  place: Place;
  max?: number;
  onNavigate?: () => void;
}) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const add = useCart((s) => s.add);
  const group = useMemo(() => bundleGroup(visitorId(), holdoutPercent), [holdoutPercent]);
  const capOf = new Map((offers ?? []).map((o) => [o.product.id, o.capPercent]));
  const pool = offers ? offers.filter((o) => o.capPercent > 0).map((o) => o.product) : suggestions ?? [];
  const items = pool.filter((p) => stockOf(p, null) > 0 || (p.variants ?? []).some((v) => v.stock > 0)).slice(0, max);
  const compact = place === "drawer";

  const viewed = useRef(false);
  const ids = items.map((p) => p.id).join(",");
  useEffect(() => {
    if (viewed.current || !ids) return;
    viewed.current = true;
    trackBundle(group === "H" ? "bundle_holdout" : "bundle_view", place, ids.split(","));
  }, [ids, place, group]);

  if (items.length === 0 || group === "H") return null;

  return (
    <section aria-labelledby={`bundle-sg-${place}`} className={compact ? "mt-4" : "nb p-4 sm:p-5"}>
      <h2
        id={`bundle-sg-${place}`}
        className={`flex items-center gap-2.5 font-display font-extrabold uppercase tracking-[.02em] text-[var(--ink)] ${compact ? "text-[14px]" : "text-[17px]"}`}
      >
        {!compact && <span aria-hidden className="tech-mark" />}
        {t("bundle.suggest.title")}
      </h2>
      <ul className={`mt-2.5 flex flex-col ${compact ? "gap-2" : "gap-2.5"}`}>
        {items.map((p) => {
          const pHref = href(`/product/${slugOf(p)}`);
          const variants = (p.variants?.length ?? 0) > 0;
          const pct = Math.min(nextPercent, capOf.get(p.id) ?? 100);
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-2">
              <Link
                href={pHref}
                onClick={onNavigate}
                className={`${compact ? "h-12 w-12" : "h-14 w-14"} shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]`}
              >
                <Image src={firstImage(p)} alt={p.title} size={120} className="h-full w-full" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={pHref}
                  onClick={onNavigate}
                  className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]"
                >
                  {p.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-display text-[14px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(p.priceMinor, p.currency)}</span>
                  {pct > 0 && (
                    <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-1.5 font-display text-[11px] font-bold text-[var(--accent-hi)]">
                      {t("bundle.suggest.percent", { n: pct })}
                    </span>
                  )}
                </p>
              </div>
              {variants ? (
                <Link
                  href={pHref}
                  onClick={onNavigate}
                  aria-label={t("bundle.pickVariant")}
                  title={t("bundle.pickVariant")}
                  className="tap grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                >
                  <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
                </Link>
              ) : (
                <button
                  type="button"
                  aria-label={t("bundle.suggest.addTitle", { title: p.title })}
                  title={t("bundle.suggest.add")}
                  onClick={() => {
                    add(p, null, 1);
                    trackAddToCart(p.id, null, 1);
                    trackBundle("bundle_add", place, [p.id], { slot: 1, kind: "cart" });
                    toast(t("product.added"));
                  }}
                  className="tap grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)] transition-colors hover:bg-[var(--accent)] hover:text-[#0e0e10]"
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
