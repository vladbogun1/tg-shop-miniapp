"use client";

import { FactoryOrderLine, StockLotsBlock, WaitLine } from "@/features/procurement";
import { ProductPickModal } from "../../ProductPickModal";
import { Input } from "@/components/ui/Input";
import { Variants } from "../Variants";
import type { ProductCtx } from "../ctx";

/** Остаток: у сохранённого товара — «Склад по партиям» (при праве «Финансы»), иначе — одно поле. */
function StockField({ x }: { x: ProductCtx }) {
  const { f, set, product, priceMinor, hasVariants, effectiveStock, baseStockRef, lotSource, setLotSource } = x;
  const stockInput = (
    <Input
      label="Остаток"
      inputMode="numeric"
      value={hasVariants ? String(effectiveStock) : f.stock}
      disabled={hasVariants}
      hint={hasVariants ? "= сумма остатков вариантов" : undefined}
      onChange={(e) => set("stock", e.target.value)}
    />
  );
  if (!product?.id) return stockInput;
  return (
    <StockLotsBlock
      productId={product.id}
      priceMinor={priceMinor}
      stock={hasVariants ? null : f.stock}
      total={effectiveStock}
      base={baseStockRef.current.stock}
      onStock={(v) => set("stock", v)}
      answer={lotSource}
      onAnswer={setLotSource}
      fallback={stockInput}
    />
  );
}

export function PricingStep({ x }: { x: ProductCtx }) {
  const { f, set, product, priceMinor, priceMarginHint, compareAtInvalid, effectiveStock } = x;
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
      <StockField x={x} />
      <Variants variants={f.variants} onChange={(v) => set("variants", v)} />
      {product?.id && <WaitLine productId={product.id} title={product.title} />}
      {product?.id && effectiveStock === 0 && <FactoryOrderLine product={product} ProductPicker={ProductPickModal} />}
    </div>
  );
}
