"use client";

/**
 * Right column of the product page: title, price (+ old price and −N%), stock, variant chips,
 * quantity, "В корзину" and "Купить". "Купить" puts the item in the cart and goes straight to the
 * checkout — the same single cart, so nothing the customer added earlier is lost.
 */
import { Check, ShoppingBag, Truck, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { maxQty, type ProductVariant, type StorefrontProduct } from "@shop/shared";
import { ProductGiftBanner } from "@/components/case/ProductGiftBanner";
import { Button } from "@/components/ui/Button";
import { RatingLink } from "@/components/reviews/RatingLink";
import { CompareToggle } from "@/components/compare/CompareToggle";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { toast } from "@/components/ui/Toast";
import { PreorderPanel } from "@/components/preorder/PreorderPanel";
import { useI18n } from "@/i18n/context";
import { trackAddToCart } from "@/lib/analytics";
import { lineKey, stockOf, useCart } from "@/lib/cart";
import { useOrderLimits } from "@/lib/order-limits";
import { discountPercent } from "@/lib/format";
import { useHydrated } from "@/lib/hooks";
import { holdUntilText, isLive, type MyPreorder, type PreorderEta, type ProductPreorder, useProductPreorder } from "@/lib/preorder";
import { useFmt } from "@/lib/use-fmt";

export function BuyBox({
  product,
  compareGroup,
  preorder = null,
}: {
  product: StorefrontProduct;
  compareGroup?: string;
  /** Guest view of the pre-order block, rendered on the server (lib/server-api getProductPreorder). */
  preorder?: ProductPreorder | null;
}) {
  const { t, href, locale } = useI18n();
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
  const { data: pre } = useProductPreorder(preorder, product.id);
  const preLines = pre?.lines ?? [];
  /** The open batch that brings this variant (or the product); a product-level line covers every variant. */
  const etaFor = (v: ProductVariant | null): PreorderEta | null =>
    preLines.find((l) => (l.variantId ?? null) === (v?.id ?? null))?.eta ?? (v ? preLines.find((l) => !l.variantId)?.eta ?? null : null);
  const myLive = (pre?.mine ?? []).filter((m) => isLive(m.status));
  const mineFor = (v: ProductVariant | null): MyPreorder | null => myLive.find((m) => (m.variantId ?? null) === (v?.id ?? null)) ?? null;
  /** Units held for me: the catalog shows stock minus every hold, mine included. */
  const heldFor = (v: ProductVariant | null): number => {
    const m = mineFor(v);
    return m && m.status === "HELD" ? m.heldQty : 0;
  };
  const heldTotal = myLive.reduce((s, m) => s + (m.status === "HELD" ? m.heldQty : 0), 0);

  // Preselect the only in-stock variant when there is exactly one; with nothing in stock, the first
  // variant that is on its way — one less click.
  const [variant, setVariant] = useState<ProductVariant | null>(() => {
    const avail = variants.filter((v) => v.stock > 0);
    if (avail.length === 1) return avail[0];
    if (avail.length === 0) {
      const coming = variants.find((v) => preorder?.lines.some((l) => l.variantId === v.id || !l.variantId));
      if (coming) return coming;
    }
    return null;
  });
  const [qty, setQty] = useState(1);

  const totalStock = stockOf(product, null);
  const stockShown = hasVariants ? (variant ? variant.stock : totalStock) : totalStock;
  const held = hasVariants && !variant ? 0 : heldFor(variant);
  const stock = Math.max(stockShown, held);
  const inStock = totalStock > 0 || heldTotal > 0;
  const needVariant = hasVariants && !variant;
  const canBuy = !needVariant && stock > 0;
  const heldMine = held > 0 ? mineFor(variant) : null;
  // sold out (the chosen variant, or the product): is it on its way / can one queue for it
  const out = !needVariant && stock <= 0;
  const selEta = out ? etaFor(variant) : null;
  const anyEta = !inStock && needVariant ? preLines[0]?.eta ?? null : null;
  const showPanel = out && (!!selEta || !!pre?.anyProduct || !!mineFor(variant));
  const off = discountPercent(product.priceMinor, product.compareAtMinor);
  const inCart = hydrated
    ? lines.find((l) => l.key === lineKey(product.id, variant?.id ?? null))?.quantity ?? 0
    : 0;

  function addToCart(): boolean {
    if (!canBuy) return false;
    // a held place sells even though the public stock (minus holds) says 0
    if (held > 0 && stockShown < held) {
      add(variant ? product : { ...product, stock: held }, variant ? { ...variant, stock: held } : null, qty);
    } else {
      add(product, variant, qty);
    }
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

      {(() => {
        // pre-order: sold out, and a batch brings it (the chosen variant, or — before choosing — the product)
        const coming = !inStock ? selEta ?? anyEta ?? (!hasVariants ? etaFor(null) : null) : out && selEta ? selEta : null;
        const tone = inStock && (!out || !selEta) ? "ok" : coming ? "pre" : "off";
        const color = tone === "ok" ? "var(--ok)" : tone === "pre" ? "var(--pre)" : "var(--faint)";
        return (
          <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold" aria-live="polite">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: color, boxShadow: tone === "off" ? undefined : `0 0 8px ${color}` }}
            />
            <span style={{ color: tone === "off" ? "var(--muted)" : tone === "pre" ? "var(--pre)" : "var(--ink)" }}>
              {tone === "pre"
                ? t("preorder.badge")
                : tone === "off"
                  ? t("product.outOfStock")
                  : stock > 0 && stock <= 3 && !held
                    ? t("product.lowStock", { n: stock })
                    : t("product.inStock")}
            </span>
          </p>
        );
      })()}

      {hasVariants && (
        <fieldset className="mt-6">
          <legend className="eyebrow mb-2.5 text-[11px]">
            {t("product.variant")}
            {needVariant && inStock ? ` — ${t("product.chooseVariant")}` : ""}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("product.variant")}>
            {variants.map((v) => {
              const on = variant?.id === v.id;
              const vOut = v.stock <= 0 && heldFor(v) <= 0;
              const vComing = vOut && !!etaFor(v);
              const selectable = !vOut || vComing || !!pre?.anyProduct;
              return (
                <button
                  key={v.id ?? v.name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!selectable}
                  onClick={() => {
                    setVariant(v);
                    setQty(1);
                  }}
                  title={vOut && !vComing ? t("product.variantOut") : undefined}
                  className={`tap inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 font-display text-[14px] font-semibold transition-colors ${
                    on
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[rgba(255,255,255,.3)]"
                  } disabled:cursor-not-allowed disabled:line-through disabled:opacity-45 ${vOut && !vComing && selectable ? "opacity-60" : ""}`}
                >
                  {on && <Check className="h-4 w-4" strokeWidth={2.25} />}
                  {v.name}
                  {vComing && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pre-soft)] px-1.5 py-px text-[10px] font-bold uppercase tracking-[.05em] text-[var(--pre)]">
                      <Truck className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      {t("preorder.variantComing")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {heldMine?.holdUntil && (
        <div className="mt-5 rounded-[var(--r-card)] border border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] p-3.5">
          <p className="font-display text-[15px] font-bold text-[var(--ink)]">
            {t("preorder.held.until", { when: holdUntilText(heldMine.holdUntil, locale) })}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-[var(--muted)]">{t("preorder.held.hint")}</p>
        </div>
      )}
      {heldMine && heldMine.status === "NOTIFIED" && <p className="mt-5 font-display text-[15px] font-bold text-[var(--ink)]">{t("preorder.notified")}</p>}

      {showPanel && (
        <PreorderPanel
          key={variant?.id ?? "p"}
          productId={product.id}
          productTitle={product.title}
          variantId={variant?.id ?? null}
          variantName={variant?.name ?? null}
          eta={selEta}
          waitingCount={pre?.waitingCount ?? null}
          mine={mineFor(variant)}
          holdHours={pre?.holdHours}
        />
      )}

      <div className={`mt-6 flex flex-wrap items-center gap-3 ${showPanel ? "hidden" : ""}`}>
        <div className="flex items-center gap-3">
          <span className="eyebrow text-[11px]">{t("qty.label")}</span>
          <QtyStepper value={qty} onChange={setQty} min={1} max={maxQty(stock, limits)} />
        </div>
        {inCart > 0 && (
          <span className="text-[13px] font-medium text-[var(--muted)]">{t("product.inCart", { n: inCart })}</span>
        )}
      </div>

      <div className={`mt-5 grid gap-3 sm:grid-cols-2 ${showPanel ? "hidden" : ""}`}>
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

      {compareGroup && (
        <div className="mt-3">
          <CompareToggle productId={product.id} group={compareGroup} variant="full" />
        </div>
      )}

      <ProductGiftBanner priceMinor={product.priceMinor} />
    </div>
  );
}
