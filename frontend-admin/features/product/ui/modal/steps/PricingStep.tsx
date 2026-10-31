"use client";

import { FactoryOrderLine, WaitLine } from "@/features/procurement";
import { ProductPickModal } from "@/components/ProductPickModal";
import { Input } from "@/components/ui/Input";
import { ProductCostBlock } from "../ProductCostBlock";
import { Variants } from "../Variants";
import type { ProductCtx } from "../ctx";

export function PricingStep({ x }: { x: ProductCtx }) {
  const { f, set, product, priceMinor, priceMarginHint, compareAtInvalid, hasVariants, effectiveStock } = x;
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Цена, ₴"
        inputMode="decimal"
        value={f.priceMajor}
        onChange={(e) => set("priceMajor", e.target.value)}
        placeholder="0"
        error={f.active && priceMinor <= 0 ? "Товару на витрине нужна цена" : undefined}
        hint={priceMarginHint ?? undefined}
      />
      <Input
        label="Старая цена, ₴"
        inputMode="decimal"
        value={f.compareAtMajor}
        onChange={(e) => set("compareAtMajor", e.target.value)}
        placeholder="не задана"
        error={compareAtInvalid ? "Должна быть больше текущей цены" : undefined}
        hint={compareAtInvalid ? undefined : "Зачёркнутая цена на сайте. Пусто или 0 — не показывать."}
      />
      <Input
        label="Остаток"
        inputMode="numeric"
        value={hasVariants ? String(effectiveStock) : f.stock}
        disabled={hasVariants}
        hint={hasVariants ? "= сумма остатков вариантов" : undefined}
        onChange={(e) => set("stock", e.target.value)}
      />
      <Variants variants={f.variants} onChange={(v) => set("variants", v)} />
      {product?.id && <WaitLine productId={product.id} title={product.title} />}
      {product?.id && effectiveStock === 0 && <FactoryOrderLine product={product} ProductPicker={ProductPickModal} />}
      {product?.id && <ProductCostBlock productId={product.id} />}
    </div>
  );
}
