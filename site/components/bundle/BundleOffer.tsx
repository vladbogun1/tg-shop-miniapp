"use client";

/**
 * «Разом дешевше» on the product page, right under the buy buttons: this product + up to three
 * accessories from paired categories, each with a checkbox (the first one ticked), the discounted
 * price and the tier percent; the set total with the struck sum and «Економія N ₴»; «Додати комплект»
 * puts the product (unless it is already in the cart) and the ticked accessories into the cart.
 *
 * Loaded on the client after hydration so the cached product page stays as it is. Prices come from
 * `bundleDiscount` (all offered items are eligible by construction); the cart asks the server again.
 * An accessory with variants links to its own page (a variant must be chosen there).
 */
import { Check, ChevronRight, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { bundleDiscount, type Product, type ProductVariant, type StorefrontProduct } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/context";
import { trackAddToCart, trackBundle } from "@/lib/analytics";
import { useBundleOfferQuery } from "@/lib/bundle";
import { stockOf, useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

function firstImage(p: Product): string | null {
  const imgs = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return imgs[0]?.url ?? null;
}

function slugOf(p: Product): string {
  return (p as Partial<StorefrontProduct>).slug || p.id;
}

function hasVariants(p: Product): boolean {
  return (p.variants?.length ?? 0) > 0;
}

/** Price of an accessory: with the bundle discount (chip + new price + struck old one) or plain. */
function PriceTag({
  price,
  off,
  percent,
  currency,
  stacked = false,
}: {
  price: number;
  off: number;
  percent: number;
  currency: string;
  /** Right column (old price on its own line) vs. one wrapping row under the title. */
  stacked?: boolean;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  if (off <= 0) {
    return <span className="font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(price, currency)}</span>;
  }
  const chip = (
    <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-1.5 font-display text-[11px] font-bold text-[var(--accent-hi)]">
      {t("product.discount", { n: percent })}
    </span>
  );
  const now = <span className="font-display text-[15px] font-bold tabular-nums text-[var(--accent)]">{fmt.money(price - off, currency)}</span>;
  const old = <s className="font-display text-[12px] font-medium tabular-nums text-[var(--faint)]">{fmt.money(price, currency)}</s>;
  return stacked ? (
    <>
      <span className="flex items-center gap-1.5">
        {chip}
        {now}
      </span>
      {old}
    </>
  ) : (
    <>
      {now}
      {old}
      {chip}
    </>
  );
}

export function BundleOffer({
  product,
  variant,
  needVariant,
}: {
  product: StorefrontProduct;
  /** The variant chosen in the buy box (null for a product without variants). */
  variant: ProductVariant | null;
  /** The product has variants and none is chosen yet. */
  needVariant: boolean;
}) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const add = useCart((s) => s.add);
  const openDrawer = useCart((s) => s.openDrawer);
  const lines = useCart((s) => s.lines);

  const { data } = useBundleOfferQuery(product.id);

  const items = useMemo(
    () => (data?.terms?.enabled ? data.items.filter((p) => stockOf(p, null) > 0).slice(0, 3) : []),
    [data]
  );
  // First simple (no-variant) accessory ticked by default.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const checked = useMemo(() => {
    if (picked) return picked;
    const first = items.find((p) => !hasVariants(p));
    return new Set(first ? [first.id] : []);
  }, [picked, items]);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || items.length === 0) return;
    viewed.current = true;
    trackBundle("bundle_view", "product", items.map((p) => p.id));
  }, [items]);

  if (!data || items.length === 0) return null;
  const terms = data.terms;
  const maxPercent = Math.max(0, ...terms.tiers.slice(0, Math.min(3, items.length)));

  const chosen = items.filter((p) => checked.has(p.id) && !hasVariants(p));
  const calc = bundleDiscount(terms, chosen.map((p) => p.priceMinor));
  const discountOf = new Map(chosen.map((p, i) => [p.id, calc.perItem[i]]));
  const mainInCart = lines.some((l) => l.productId === product.id && l.stock > 0);
  const mainPrice = product.priceMinor;
  const sum = mainPrice + chosen.reduce((s, p) => s + p.priceMinor, 0);
  const total = sum - calc.discountMinor;
  const currency = product.currency ?? "UAH";
  const blockedByVariant = needVariant && !mainInCart;

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function addSet() {
    if (chosen.length === 0 || blockedByVariant) return;
    if (!mainInCart) {
      add(product, variant, 1);
      trackAddToCart(product.id, variant?.id ?? null, 1);
    }
    for (const p of chosen) {
      add(p, null, 1);
      trackAddToCart(p.id, null, 1);
    }
    trackBundle("bundle_add", "product", chosen.map((p) => p.id));
    toast(t("bundle.added"));
    openDrawer();
  }

  return (
    <section aria-labelledby="pd-bundle" className="nb mt-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="pd-bundle" className="flex items-center gap-2.5 font-display text-[18px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
          <span aria-hidden className="tech-mark" />
          {t("bundle.title")}
        </h2>
        {maxPercent > 0 && (
          <p className="text-[12px] font-medium text-[var(--muted)]">{t("bundle.subtitle", { n: maxPercent })}</p>
        )}
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
        {/* the product itself */}
        <li className="flex items-center gap-3 py-2.5">
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
            <Image src={firstImage(product)} alt="" size={120} className="h-full w-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow block text-[10px]">{mainInCart ? t("bundle.inCart") : t("bundle.thisItem")}</span>
            <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">{product.title}</span>
            <span className="mt-1 block font-display text-[15px] font-bold tabular-nums text-[var(--ink)] sm:hidden">{fmt.money(mainPrice, currency)}</span>
          </span>
          <span className="hidden shrink-0 font-display text-[15px] font-bold tabular-nums text-[var(--ink)] sm:block">{fmt.money(mainPrice, currency)}</span>
        </li>

        {items.map((p) => {
          const variantsOnly = hasVariants(p);
          const on = checked.has(p.id) && !variantsOnly;
          const off = discountOf.get(p.id) ?? 0;
          const pHref = href(`/product/${slugOf(p)}`);
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              {variantsOnly ? (
                <span aria-hidden className="h-6 w-6 shrink-0" />
              ) : (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={t("bundle.include", { title: p.title })}
                  onClick={() => toggle(p.id)}
                  className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border transition-colors before:absolute before:-inset-2.5 before:content-[''] ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[#0e0e10]"
                      : "border-[var(--line-strong)] bg-[var(--surface-2)] text-transparent hover:border-[var(--accent)]"
                  }`}
                >
                  <Check className="h-4 w-4" strokeWidth={3} />
                </button>
              )}
              <Link href={pHref} className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
                <Image src={firstImage(p)} alt={p.title} size={120} className="h-full w-full" />
              </Link>
              <span className="min-w-0 flex-1">
                <Link
                  href={pHref}
                  className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]"
                >
                  {p.title}
                </Link>
                {variantsOnly && (
                  <Link href={pHref} className="mt-0.5 inline-flex items-center gap-0.5 text-[12px] font-semibold text-[var(--accent-hi)]">
                    {t("bundle.pickVariant")}
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </Link>
                )}
                {/* phones: the price goes under the title so the title keeps its width */}
                <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 sm:hidden">
                  <PriceTag price={p.priceMinor} off={on ? off : 0} percent={calc.percent} currency={p.currency ?? currency} />
                </span>
              </span>
              <span className="hidden shrink-0 flex-col items-end gap-0.5 sm:flex">
                <PriceTag price={p.priceMinor} off={on ? off : 0} percent={calc.percent} currency={p.currency ?? currency} stacked />
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="eyebrow text-[11px]">{t("bundle.total")}</span>
            <span className="font-display text-[22px] font-bold leading-none tabular-nums text-[var(--accent)]">{fmt.money(total, currency)}</span>
            {calc.discountMinor > 0 && (
              <s className="font-display text-[14px] font-medium tabular-nums text-[var(--faint)]">{fmt.money(sum, currency)}</s>
            )}
          </p>
          {calc.discountMinor > 0 ? (
            <p className="mt-1 text-[13px] font-semibold text-[var(--ok)]">{t("bundle.save", { amount: fmt.money(calc.discountMinor, currency) })}</p>
          ) : (
            <p className="mt-1 text-[12px] font-medium text-[var(--muted)]">{t("bundle.pickSome")}</p>
          )}
          {blockedByVariant && chosen.length > 0 && (
            <p className="mt-1 text-[12px] font-semibold text-[var(--warn)]">{t("bundle.chooseVariant")}</p>
          )}
        </div>
        <Button
          variant="accent"
          size="md"
          disabled={chosen.length === 0 || blockedByVariant}
          icon={<PackagePlus className="h-5 w-5" strokeWidth={2.25} />}
          onClick={addSet}
          className="sm:shrink-0"
        >
          {t("bundle.add")}
        </Button>
      </div>
    </section>
  );
}
