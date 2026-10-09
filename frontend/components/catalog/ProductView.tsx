"use client";

/**
 * ProductView — FULLSCREEN product detail overlay (ChiSetup).
 * Same behavior as before: gallery on top, scrollable copy, STICKY bottom action
 * bar within thumb reach; body-scroll lock; Esc / ✕ / backdrop closes; variant
 * gating + AddToCartControl + onAdded toast all unchanged. Only the look changes.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { AskAboutProduct } from "@/components/catalog/AskAboutProduct";
import { CompareViewButton } from "@/components/compare/CompareBits";
import { compareGroupOf } from "@shop/shared";
import { useCompare } from "@/lib/compare";
import { Gallery } from "@/components/catalog/Gallery";
import { ConditionPlate, ProductBrand, ProductCrumbs, SpecsTable } from "@/components/catalog/ProductSpecs";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import { RatingBadge } from "@/components/reviews/Stars";
import { useT } from "@/i18n/context";
import { trackProductView } from "@/lib/analytics";
import { EMPTY_SCHEMA, useCatalogSchema } from "@/lib/catalog";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { overlayRise, backdrop } from "@/lib/motion";
import type { Product, ProductVariant } from "@/lib/api";

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
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [touchedVariant, setTouchedVariant] = useState(false);

  const needsVariant = hasVariants && !variant;
  const stock = hasVariants ? (variant?.stock ?? 0) : (product.stock ?? 0);

  // One product_view per opening of the sheet (ViewBody is keyed by product id).
  useEffect(() => {
    trackProductView(product.id);
  }, [product.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // the tab bar (which may have slid away in the catalogue) comes back under the sheet's action bar
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

  // The action bar (button + hint + the tab bar under it) is taller than any fixed guess once the
  // hint or a variant warning wraps, and the end of the description hid behind it. The copy now
  // scrolls exactly past the bar's measured height, plus breathing room.
  const barRef = useRef<HTMLDivElement>(null);
  const [barH, setBarH] = useState<number | null>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

            {hasVariants && (
              <div className="mt-5">
                <p className="eyebrow mb-2.5 !tracking-[0.2em]">
                  {t("product.variantLabel")}
                  {needsVariant && touchedVariant && <span className="text-[var(--danger)]">{t("product.chooseHint")}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(product.variants ?? []).map((v) => {
                    const out = v.stock <= 0;
                    const on = variant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={out}
                        onClick={() => {
                          haptic();
                          setTouchedVariant(true);
                          setVariant(v);
                        }}
                        className={`nb-chip nb-press inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] disabled:opacity-40 ${on ? "nb-chip-active" : ""}`}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={2.75} />}
                        {v.name}
                        {out ? t("product.variantOut") : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
        <div
          ref={barRef}
          className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--line)] px-4 pt-3 backdrop-blur-[12px]"
          style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-bottom))", background: "rgba(14,14,16,.9)" }}
        >
          <div className="mx-auto w-full max-w-[480px]">
            <AddToCartControl
              product={product}
              variant={variant}
              needsVariant={needsVariant}
              fullWidth
              onAdded={() => {
                haptic();
                onAdded?.();
              }}
            />
            <p className="mt-2 text-center text-[12px] font-medium text-[var(--muted)]">
              {stock > 0
                ? t("product.stockLeft", { n: stock })
                : hasVariants && !variant
                  ? t("addToCart.chooseVariant")
                  : t("product.outOfStock")}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
