"use client";

import { Check } from "lucide-react";
import { heldFor } from "@/features/preorders";
import { useT } from "@/i18n/context";
import type { Product } from "@/lib/api";
import { haptic } from "@/platform/telegram";
import type { useProductPurchase } from "./use-product-purchase";

type Purchase = ReturnType<typeof useProductPurchase>;

/** Variant chips; out-of-stock ones are disabled unless held / coming / can be notified. */
export function VariantPicker({ product, p }: { product: Product; p: Purchase }) {
  const t = useT();
  const { variant, setVariant, touchedVariant, setTouchedVariant, needsVariant, mineAll, coming, canNotify } = p;
  return (
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
                          {v.stock > 0 ? "" : vHeld ? t("preorder.variant.held") : vComing ? t("preorder.variant.coming") : t("product.variantOutSuffix")}
                        </button>
                      );
                    })}
                  </div>
                </div>
  );
}
