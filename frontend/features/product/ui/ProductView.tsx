"use client";

/**
 * ProductView — FULLSCREEN product detail overlay (ChiSetup).
 * Same behavior as before: gallery on top, scrollable copy, STICKY bottom action
 * bar within thumb reach; body-scroll lock; Esc / ✕ / backdrop closes; variant
 * gating + AddToCartControl + onAdded toast all unchanged. Only the look changes.
 */
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@shop/ui/toast";
import { AskAboutProduct } from "./AskAboutProduct";
import { ProductGiftBanner } from "@/features/gift";
import { CompareViewButton, useCompare } from "@/features/compare";
import { compareGroupOf } from "@shop/core/compare";
import { Gallery } from "./Gallery";
import { ConditionPlate, ProductBrand, ProductCrumbs, SpecsTable } from "./ProductSpecs";
import { ProductActionBar } from "./ProductActionBar";
import { useProductPurchase } from "./use-product-purchase";
import { useSheetChrome } from "./use-sheet-chrome";
import { VariantPicker } from "./VariantPicker";
import { PreorderBlock, PreorderSheet } from "@/features/preorders";
import { ProductReviews, RatingBadge } from "@/features/reviews";
import { useT } from "@/i18n/context";
import { trackProductView } from "@/lib/analytics";
import { EMPTY_SCHEMA } from "@shop/customer/catalog/model/filter";
import { useCatalogSchema } from "@/features/catalog";
import { money } from "@/lib/money";
import { haptic } from "@/platform/telegram";
import { overlayRise, backdrop } from "@/lib/motion";
import type { Product } from "@/lib/api";

interface Nav {
  /** Breadcrumb tap: back to the catalog with this category (null = all products). */
  onCategory?: (slug: string | null) => void;
  /** Brand tap: back to the catalog filtered by this brand. */
  onBrand?: (slug: string) => void;
}

export function ProductView({
  product,
  onClose,
  onAdded,
  onCategory,
  onBrand,
}: {
  product: Product | null;
  onClose: () => void;
  onAdded?: () => void;
} & Nav) {
  return (
    <AnimatePresence>
      {product && (
        <ViewBody key={product.id} product={product} onClose={onClose} onAdded={onAdded} onCategory={onCategory} onBrand={onBrand} />
      )}
    </AnimatePresence>
  );
}


function ViewBody({
  product,
  onClose,
  onAdded,
  onCategory,
  onBrand,
}: {
  product: Product;
  onClose: () => void;
  onAdded?: () => void;
} & Nav) {
  const t = useT();
  const schema = useCatalogSchema().data ?? EMPTY_SCHEMA;
  const p = useProductPurchase(product);
  const { hasVariants, mode, eta, queued, holdHours, needsVariant, variant, preQ } = p;
  const [sheetOpen, setSheetOpen] = useState(false);
  const fireToast = (m: string) => toast.success(m, { duration: 1800 });

  // One product_view per opening of the sheet (ViewBody is keyed by product id).
  useEffect(() => {
    trackProductView(product.id);
  }, [product.id]);

  const { barRef, barH } = useSheetChrome(onClose);
  const reviewsRef = useRef<HTMLDivElement>(null);

  const close = () => {
    haptic();
    onClose();
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[70]">
      <motion.div
        variants={backdrop}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={close}
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      />

      <motion.div
        variants={overlayRise}
        initial="initial"
        animate="animate"
        exit="exit"
        className="absolute inset-0 flex flex-col"
        style={{ background: "var(--bg)" }}
      >
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={close}
          className="nb-press tap absolute right-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-[var(--line-strong)] text-[var(--ink)] backdrop-blur-[6px]"
          style={{ top: "max(14px, var(--safe-top))", background: "rgba(14,14,16,.72)" }}
        >
          <X className="h-5 w-5" strokeWidth={2.5} />
        </button>

        <div
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4"
          // Scrolls BELOW Telegram's fullscreen buttons (safe area), not under them.
          style={{
            marginTop: "var(--safe-top)",
            paddingTop: "14px",
            paddingBottom: barH ? `${barH + 28}px` : "calc(220px + var(--safe-bottom))",
          }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col">
            <div className="nb overflow-hidden">
              <Gallery images={product.images} alt={product.title} />
            </div>

            <div className="mt-4">
              <ProductCrumbs schema={schema} product={product} onCategory={onCategory} />
              <h2 className="font-display text-[22px] font-bold leading-tight text-[var(--ink)]">{product.title}</h2>
              {(product.ratingCount ?? 0) > 0 && (
                <div className="mt-1.5">
                  <RatingBadge
                    size="md"
                    avg={product.ratingAvg}
                    count={product.ratingCount}
                    onClick={() => reviewsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  />
                </div>
              )}
              <span className="font-display mt-2 inline-block text-[26px] font-bold tabular-nums leading-none text-[var(--accent)]">
                {money(product.priceMinor, product.currency)}
              </span>
              <div className="flex flex-wrap items-center gap-x-2">
                <ProductBrand product={product} onBrand={onBrand} />
                {schema.categories.length > 0 && (
                  <CompareViewButton
                    productId={product.id}
                    group={compareGroupOf(schema, product.categoryId)}
                    onOpenComparison={() => useCompare.getState().openScreen(compareGroupOf(schema, product.categoryId))}
                  />
                )}
              </div>
            </div>

            <ConditionPlate product={product} />

            {hasVariants && <VariantPicker product={product} p={p} />}

            {mode === "pre" && (
              <PreorderBlock eta={eta} waitingCount={preQ.data?.waitingCount ?? null} mine={queued} holdHours={holdHours} onEdit={() => setSheetOpen(true)} />
            )}

            <ProductGiftBanner priceMinor={product.priceMinor} currency={product.currency ?? "UAH"} />

            <SpecsTable schema={schema} product={product} />

            {product.description ? (
              <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-[#C9C9CF]">
                {product.description}
              </p>
            ) : (
              <div className="flex flex-1 items-center justify-center py-8 text-center text-[13px] text-[var(--faint)]">
                {t("product.noDescription")}
              </div>
            )}

            <div>
              <AskAboutProduct productId={product.id} />
            </div>

            <div ref={reviewsRef} className="scroll-mt-4">
              <ProductReviews productId={product.id} />
            </div>
          </div>
        </div>

        {/* sticky bottom action bar */}
        <ProductActionBar ref={barRef} p={p} onAdded={onAdded} onPreorder={() => setSheetOpen(true)} />
      </motion.div>
      <PreorderSheet
        product={product}
        variant={needsVariant ? null : variant}
        mine={queued}
        coming={!!eta}
        holdHours={holdHours}
        open={sheetOpen && mode === "pre"}
        onClose={() => setSheetOpen(false)}
        onDone={fireToast}
      />
    </div>
  );
}
