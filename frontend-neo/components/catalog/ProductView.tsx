"use client";

/**
 * ProductView — FULLSCREEN product detail overlay (NEO-BRUTALISM).
 * Same behavior as before: gallery on top, scrollable copy, STICKY bottom action
 * bar within thumb reach; body-scroll lock; Esc / ✕ / backdrop closes; variant
 * gating + AddToCartControl + onAdded toast all unchanged. Only the look changes.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AddToCartControl } from "@/components/catalog/AddToCartControl";
import { Gallery } from "@/components/catalog/Gallery";
import { money } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { overlayRise, backdrop } from "@/lib/motion";
import type { Product, ProductVariant } from "@/lib/api";

export function ProductView({
  product,
  onClose,
  onAdded,
}: {
  product: Product | null;
  onClose: () => void;
  onAdded?: () => void;
}) {
  return (
    <AnimatePresence>
      {product && <ViewBody key={product.id} product={product} onClose={onClose} onAdded={onAdded} />}
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
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
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
          aria-label="Закрыть"
          onClick={close}
          className="nb nb-press tap absolute right-4 z-20 grid h-11 w-11 place-items-center text-[var(--ink)]"
          style={{ top: "max(14px, var(--safe-top))", background: "var(--c3)" }}
        >
          <X className="h-5 w-5" strokeWidth={3} />
        </button>

        <div
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(160px+var(--safe-bottom))]"
          style={{ paddingTop: "max(14px, var(--safe-top))" }}
        >
          <div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col">
            <div className="nb overflow-hidden">
              <Gallery images={product.images} alt={product.title} />
            </div>

            <div className="mt-4">
              <h2 className="text-[24px] font-black leading-tight text-[var(--ink)]">{product.title}</h2>
              <span className="mt-2 inline-block border-[3px] border-[var(--line)] bg-[var(--c3)] px-2.5 py-1 text-[20px] font-black text-[var(--ink)] shadow-[4px_4px_0_var(--shadow)]">
                {money(product.priceMinor, product.currency)}
              </span>
            </div>

            {hasVariants && (
              <div className="mt-5">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  Вариант
                  {needsVariant && touchedVariant && <span className="text-[var(--danger)]"> — выберите</span>}
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
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        {v.name}
                        {out ? " (нет)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(product.tags?.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {product.tags!.map((t) => (
                  <span
                    key={t.id}
                    className="nb-flat px-2.5 py-1 text-[12px] font-bold text-[var(--ink)]"
                  >
                    #{t.name}
                  </span>
                ))}
              </div>
            )}

            {product.description ? (
              <p className="mt-4 whitespace-pre-line text-[14px] font-medium leading-relaxed text-[var(--muted)]">
                {product.description}
              </p>
            ) : (
              <div className="flex flex-1 items-center justify-center py-8 text-center text-[13px] text-[var(--faint)]">
                Описание отсутствует
              </div>
            )}
          </div>
        </div>

        {/* sticky bottom action bar */}
        <div
          className="absolute inset-x-0 bottom-0 z-10 border-t-[3px] border-[var(--line)] px-4 pt-3"
          style={{ paddingBottom: "calc(84px + var(--safe-bottom))", background: "var(--bg)" }}
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
            <p className="mt-2 text-center text-[12px] font-bold uppercase tracking-wide text-[var(--muted)]">
              {stock > 0 ? `В наличии: ${stock}` : hasVariants && !variant ? "Выберите вариант" : "Нет в наличии"}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
