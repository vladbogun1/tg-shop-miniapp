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
import { toast } from "@shop/ui/toast";
import { AskAboutProduct } from "@/components/catalog/AskAboutProduct";
import { ProductGiftBanner } from "@/components/case/ProductGiftBanner";
import { CompareViewButton } from "@/components/compare/CompareBits";
import { availabilityOf } from "@shop/core/availability";
import { compareGroupOf } from "@shop/core/compare";
import { useCompare } from "@/lib/compare";
import { Gallery } from "@/components/catalog/Gallery";
import { ConditionPlate, ProductBrand, ProductCrumbs, SpecsTable } from "@/components/catalog/ProductSpecs";
import { HoldBanner, PreorderBlock, PreorderCta } from "@/components/preorder/PreorderBlock";
import { PreorderSheet } from "@/components/preorder/PreorderSheet";
import { ProductReviews } from "@/components/reviews/ProductReviews";
import { RatingBadge } from "@/components/reviews/Stars";
import { useT } from "@/i18n/context";
import { trackProductView } from "@/lib/analytics";
import { EMPTY_SCHEMA } from "@shop/customer/catalog/model/filter";
import { useCatalogSchema } from "@/lib/catalog";
import { money } from "@/lib/money";
import { heldFor, queuedFor, useComing, useMyPreorders, useProductPreorder } from "@/lib/preorders";
import { useAccessToken } from "@/lib/auth";
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

  // Pre-orders: stock is net of reservations (mine too), so a unit held for me is added back here.
  const token = useAccessToken();
  const preQ = useProductPreorder(product.id);
  const coming = useComing();
  const mineAll = useMyPreorders().list;
  const lineVariantId = hasVariants ? (variant?.id ?? null) : null;
  const hold = needsVariant ? undefined : heldFor(mineAll, product.id, lineVariantId);
  const queued = needsVariant ? undefined : queuedFor(mineAll, product.id, lineVariantId);
  const eta = needsVariant
    ? undefined
    : (preQ.data?.lines.find((l) => (l.variantId ?? null) === lineVariantId)?.eta ?? coming.etaOf(product.id, lineVariantId));
  const buyable = stock + (hold?.heldQty ?? 0);
  const canNotify = !!token && preQ.data?.anyProduct !== false;
  const holdHours = preQ.data?.holdHours ?? coming.holdHoursOf(product.id);
  const avail = availabilityOf(product, variant, { coming: !!eta, heldQty: hold?.heldQty });
  const mode: "pick" | "buy" | "pre" | "out" = needsVariant
    ? "pick"
    : avail === "in_stock" || avail === "held"
      ? "buy"
      : avail === "preorder" || canNotify
        ? "pre"
        : "out";
  const buyProduct = hold && !hasVariants ? { ...product, stock: buyable } : product;
  const buyVariant = hold && variant ? { ...variant, stock: buyable } : variant;
  const [sheetOpen, setSheetOpen] = useState(false);
  const fireToast = (m: string) => toast.success(m, { duration: 1800 });

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
                    const vHeld = !!heldFor(mineAll, product.id, v.id ?? null);
                    const vComing = !!coming.etaOf(product.id, v.id ?? null);
                    const out = v.stock <= 0 && !vHeld && !vComing && !canNotify;
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
                        {v.stock > 0 ? "" : vHeld ? t("preorder.variant.held") : vComing ? t("preorder.variant.coming") : t("product.variantOut")}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

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
        <div
          ref={barRef}
          className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--line)] px-4 pt-3 backdrop-blur-[12px]"
          style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-bottom))", background: "rgba(14,14,16,.9)" }}
        >
          <div className="mx-auto w-full max-w-[480px]">
            {hold && mode === "buy" && <HoldBanner hold={hold} />}
            {mode === "pre" ? (
              <PreorderCta hasEta={!!eta} queued={!!queued} onClick={() => { haptic(); setSheetOpen(true); }} />
            ) : (
              <AddToCartControl
                product={buyProduct}
                variant={buyVariant}
                needsVariant={needsVariant}
                fullWidth
                onAdded={() => {
                  haptic();
                  onAdded?.();
                }}
              />
            )}
            {/* in the pre-order state the block above already carries the hint */}
            {mode !== "pre" && (
            <p className="mt-2 text-center text-[12px] font-medium text-[var(--muted)]">
              {hold && buyable > 0
                  ? t("preorder.held.left", { n: buyable })
                  : stock > 0
                  ? t("product.stockLeft", { n: stock })
                : hasVariants && !variant
                  ? t("addToCart.chooseVariant")
                  : t("product.outOfStock")}
            </p>
            )}
          </div>
        </div>
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
