"use client";

/**
 * Right column of the product page: title, price (+ old price and −N%), stock, variant chips,
 * quantity, "В корзину" and "Купить". "Купить" puts the item in the cart and goes straight to the
 * checkout — the same single cart, so nothing the customer added earlier is lost.
 */
import { Check, ShoppingBag, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ProductVariant, StorefrontProduct } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { RatingLink } from "@/components/reviews/RatingLink";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/context";
import { trackAddToCart } from "@/lib/analytics";
import { lineKey, stockOf, useCart } from "@/lib/cart";
import { maxQty, useOrderLimits } from "@/lib/order-limits";
import { discountPercent } from "@/lib/format";
import { useHydrated } from "@/lib/hooks";
import { useFmt } from "@/lib/use-fmt";

export function BuyBox({ product }: { product: StorefrontProduct }) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const router = useRouter();
  const hydrated = useHydrated();
  const add = useCart((s) => s.add);
  const openDrawer = useCart((s) => s.openDrawer);
  const lines = useCart((s) => s.lines);
  const limits = useOrderLimits();

  const variants = useMemo(
    () => (product.variants ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [product.variants]
  );
  const hasVariants = variants.length > 0;
  // Preselect the only in-stock variant when there is exactly one — one less click.
  const [variant, setVariant] = useState<ProductVariant | null>(() => {
    const avail = variants.filter((v) => v.stock > 0);
    return avail.length === 1 ? avail[0] : null;
  });
  const [qty, setQty] = useState(1);

  const totalStock = stockOf(product, null);
  const stock = hasVariants ? (variant ? variant.stock : totalStock) : totalStock;
  const inStock = totalStock > 0;
  const needVariant = hasVariants && !variant;
  const canBuy = inStock && !needVariant && stock > 0;
  const off = discountPercent(product.priceMinor, product.compareAtMinor);
  const inCart = hydrated
    ? lines.find((l) => l.key === lineKey(product.id, variant?.id ?? null))?.quantity ?? 0
    : 0;

  function addToCart(): boolean {
    if (!canBuy) return false;
    add(product, variant, qty);
    trackAddToCart(product.id, variant?.id ?? null, qty);
    return true;
  }

  return (
    <div>
      <h1 className="font-display text-[26px] font-bold leading-tight tracking-[.01em] text-[var(--ink)] sm:text-[32px]">
        {product.title}
      </h1>
      <RatingLink avg={product.ratingAvg} count={product.ratingCount} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-display text-[34px] font-bold leading-none tabular-nums text-[var(--accent)] [text-shadow:0_0_24px_rgba(255,102,0,.35)]">
          {fmt.money(product.priceMinor, product.currency)}
        </span>
        {off > 0 && (
          <>
            <s className="font-display text-[18px] font-medium tabular-nums text-[var(--faint)]">{fmt.money(product.compareAtMinor, product.currency)}</s>
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-0.5 font-display text-[14px] font-bold text-[var(--accent-hi)]">
              {t("product.discount", { n: off })}
            </span>
          </>
        )}
      </div>

      <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold" aria-live="polite">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: inStock ? "var(--ok)" : "var(--faint)", boxShadow: inStock ? "0 0 8px var(--ok)" : undefined }}
        />
        <span style={{ color: inStock ? "var(--ink)" : "var(--muted)" }}>
          {!inStock
            ? t("product.outOfStock")
            : stock > 0 && stock <= 3
              ? t("product.lowStock", { n: stock })
              : t("product.inStock")}
        </span>
      </p>

      {hasVariants && (
        <fieldset className="mt-6">
          <legend className="eyebrow mb-2.5 text-[11px]">
            {t("product.variant")}
            {needVariant && inStock ? ` — ${t("product.chooseVariant")}` : ""}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("product.variant")}>
            {variants.map((v) => {
              const on = variant?.id === v.id;
              const out = v.stock <= 0;
              return (
                <button
                  key={v.id ?? v.name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={out}
                  onClick={() => {
                    setVariant(v);
                    setQty(1);
                  }}
                  title={out ? t("product.variantOut") : undefined}
                  className={`tap inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 font-display text-[14px] font-semibold transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[rgba(255,255,255,.3)]"
                  } disabled:cursor-not-allowed disabled:line-through disabled:opacity-45`}
                >
                  {on && <Check className="h-4 w-4" strokeWidth={2.25} />}
                  {v.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="eyebrow text-[11px]">{t("qty.label")}</span>
          <QtyStepper value={qty} onChange={setQty} min={1} max={maxQty(stock, limits)} />
        </div>
        {inCart > 0 && (
          <span className="text-[13px] font-medium text-[var(--muted)]">{t("product.inCart", { n: inCart })}</span>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button
          variant="accent"
          size="lg"
          disabled={!canBuy}
          icon={<ShoppingBag className="h-5 w-5" strokeWidth={2.25} />}
          onClick={() => {
            if (addToCart()) {
              toast(t("product.added"));
              openDrawer();
            }
          }}
        >
          {inStock ? (needVariant ? t("product.chooseVariant") : t("product.addToCart")) : t("product.outOfStock")}
        </Button>
        <Button
          variant="ink"
          size="lg"
          disabled={!canBuy}
          icon={<Zap className="h-5 w-5" strokeWidth={2.25} />}
          onClick={() => {
            if (addToCart()) router.push(href("/checkout"));
          }}
        >
          {t("product.buyNow")}
        </Button>
      </div>
    </div>
  );
}
