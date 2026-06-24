"use client";

/**
 * ProductView — fullscreen product detail overlay (rework of ProductSheet).
 *
 * Layout (top → bottom):
 *   ┌──────────────────────────────────────────┐
 *   │ TOP ACTION AREA  (sticky, does NOT scroll) │
 *   │   ✕ close · title · price                  │
 *   │   variant chips (required when present)    │
 *   │   AddToCartControl (В корзину → −qty+)      │
 *   ├──────────────────────────────────────────┤
 *   │ SCROLLABLE region (fills remaining height) │
 *   │   image GALLERY (‹ › arrows + dots + swipe)│
 *   │   description (scrolls naturally)          │
 *   └──────────────────────────────────────────┘
 *
 * The buy/variant/qty controls live ABOVE the photo. The photo + description
 * are the scrollable "card" beneath. Short descriptions stay centred/padded so
 * the layout doesn't stretch weirdly. Body scroll is locked while open.
 *
 * framer-motion slide+fade entrance; ✕ top-right; Esc / backdrop tap to close.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { Gallery } from "@/components/catalog/Gallery";
import { GlassChip } from "@/components/ui/GlassChip";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import type { Product, ProductVariant } from "@/lib/api";

export function ProductView({
  product,
  onClose,
  onAdded,
}: {
  product: Product | null;
  onClose: () => void;
  /** Fired after a successful first add — e.g. toast. */
  onAdded?: () => void;
}) {
  return (
    <AnimatePresence>
      {product && (
        <ViewBody
          key={product.id}
          product={product}
          onClose={onClose}
          onAdded={onAdded}
        />
      )}
    </AnimatePresence>
  );
}

function ViewBody({
  product,
  onClose,
  onAdded,
}: {
  product: Product;
  onClose: () => void;
  onAdded?: () => void;
}) {
  const hasVariants = (product.variants?.length ?? 0) > 0;
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [touchedVariant, setTouchedVariant] = useState(false);

  const needsVariant = hasVariants && !variant;
  const stock = hasVariants ? (variant?.stock ?? 0) : (product.stock ?? 0);

  // Lock body scroll + Esc-to-close while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", stiffness: 360, damping: 36 }}
      className="fixed inset-0 z-[70] flex flex-col"
      style={{
        backgroundColor: "rgba(11,16,32,0.72)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        transform: "translateZ(0)",
      }}
    >
      {/* ── TOP ACTION AREA (sticky, no scroll) — no glass, plain header ──── */}
      <div
        className="relative z-10 shrink-0 rounded-b-[var(--r-lg)] px-4 pb-4"
        style={{ paddingTop: "max(14px, var(--safe-top))" }}
      >
        <div className="mx-auto w-full max-w-[480px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[20px] font-bold leading-tight text-[var(--text)]">
                {product.title}
              </h2>
              <p className="mt-0.5 text-[18px] font-bold text-[var(--accent)]">
                {money(product.priceMinor, product.currency)}
              </p>
            </div>
            <motion.button
              type="button"
              aria-label="Закрыть"
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="glass tap flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r-pill)] text-[var(--text)]"
            >
              <X className="h-5 w-5" />
            </motion.button>
          </div>

          {/* variants */}
          {hasVariants && (
            <div className="mt-3">
              <p className="mb-2 text-[13px] font-medium text-[var(--text-muted)]">
                Вариант
                {needsVariant && touchedVariant && (
                  <span className="text-[var(--danger)]"> — выберите</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {(product.variants ?? []).map((v) => (
                  <GlassChip
                    key={v.id}
                    active={variant?.id === v.id}
                    icon={
                      variant?.id === v.id ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : undefined
                    }
                    onClick={() => {
                      if (v.stock <= 0) return;
                      setTouchedVariant(true);
                      setVariant(v);
                    }}
                  >
                    {v.name}
                    {v.stock <= 0 ? " (нет)" : ""}
                  </GlassChip>
                ))}
              </div>
            </div>
          )}

          {/* add-to-cart (morphs to −qty+) */}
          <div className="mt-4">
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
            <p className="mt-2 text-center text-[12px] text-[var(--text-faint)]">
              {stock > 0
                ? `В наличии: ${stock}`
                : hasVariants && !variant
                  ? "Выберите вариант"
                  : "Нет в наличии"}
            </p>
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE region (gallery + description) ─────────────────────── */}
      {/* pb clears the floating TabBar (~44px + 12px margin) so the end of long
          descriptions can scroll fully into view above the navbar. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(96px+var(--safe-bottom))] pt-4">
        <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col">
          <Gallery images={product.images} alt={product.title} />

          {/* tags */}
          {(product.tags?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {product.tags!.map((t) => (
                <span
                  key={t.id}
                  className="glass rounded-[var(--r-pill)] px-2.5 py-1 text-[12px] text-[var(--text-muted)]"
                >
                  #{t.name}
                </span>
              ))}
            </div>
          )}

          {product.description ? (
            <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-[var(--text-muted)]">
              {product.description}
            </p>
          ) : (
            // Short/empty: keep the gallery balanced, don't stretch weirdly.
            <div className="flex flex-1 items-center justify-center py-8 text-center text-[13px] text-[var(--text-faint)]">
              Описание отсутствует
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
