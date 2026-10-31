"use client";

/**
 * Right column of the product page: title, price (+ old price and −N%), stock, variant chips,
 * quantity, "В корзину" and "Купить". "Купить" puts the item in the cart and goes straight to the
 * checkout — the same single cart, so nothing the customer added earlier is lost.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { type ProductVariant } from "@shop/customer/catalog/model/product";
import { type StorefrontProduct } from "@shop/core/site";
import { ProductGiftBanner } from "@/features/gift/view/ProductGiftBanner";
import { RatingLink } from "@/features/reviews/view/RatingLink";
import { CompareToggle } from "@/features/compare/view/CompareToggle";
import { toast } from "@shop/ui/toast";
import { useI18n } from "@/i18n/context";
import { trackAddToCart } from "@/lib/analytics";
import { lineKey, useCart } from "@/features/cart";
import { useOrderLimits } from "@/features/cart";
import { discountPercent } from "@/lib/format";
import { useHydrated } from "@/lib/hooks";
import { type ProductPreorder, useProductPreorder } from "@/features/preorder";
import { useFmt } from "@/lib/use-fmt";
import { ActionButtons, BuyPreorderPanel, HeldNotice, preorderLookups, PriceBlock, QtyRow, soldOutState, StockLine, stockLevels, VariantPicker } from "./BuyBoxParts";

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
  const lk = preorderLookups(pre);

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

  const levels = stockLevels(product, hasVariants, variant, lk);
  const { stock, held, inStock, needVariant, canBuy, stockShown } = levels;
  const { heldMine, out, selEta, anyEta, showPanel } = soldOutState(variant, lk, pre, levels);
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

      <PriceBlock product={product} off={off} fmt={fmt} t={t} />

      <StockLine info={{ inStock, out, selEta, anyEta, hasVariants, etaFor: lk.etaFor, stock, held }} t={t} />

      {hasVariants && (
        <VariantPicker
          variants={variants}
          variant={variant}
          onPick={(v) => {
            setVariant(v);
            setQty(1);
          }}
          needVariant={needVariant}
          inStock={inStock}
          lk={lk}
          anyProduct={!!pre?.anyProduct}
          t={t}
        />
      )}

      <HeldNotice heldMine={heldMine} locale={locale} t={t} />

      {showPanel && <BuyPreorderPanel product={product} variant={variant} eta={selEta} mine={lk.mineFor(variant)} pre={pre} />}

      <QtyRow qty={qty} onQty={setQty} stock={stock} limits={limits} inCart={inCart} hidden={showPanel} t={t} />

      <ActionButtons
        canBuy={canBuy}
        inStock={inStock}
        needVariant={needVariant}
        hidden={showPanel}
        onAdd={() => {
          if (addToCart()) {
            toast.success(t("product.added"));
            openDrawer();
          }
        }}
        onBuyNow={() => {
          if (addToCart()) router.push(href("/checkout"));
        }}
        t={t}
      />

      {compareGroup && (
        <div className="mt-3">
          <CompareToggle productId={product.id} group={compareGroup} variant="full" />
        </div>
      )}

      <ProductGiftBanner priceMinor={product.priceMinor} />
    </div>
  );
}
