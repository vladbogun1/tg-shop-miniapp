"use client";

import { FactoryOrderLine, RaiseQuestions, StockLotsBlock, WaitLine, type LotRaise } from "@/features/procurement";
import { ProductPickModal } from "../../ProductPickModal";
import { Input } from "@/components/ui/Input";
import { stockRaiseRows } from "../../../model/form";
import { Variants } from "../Variants";
import { ParcelSizeEditor } from "@/features/delivery";
import type { ProductCtx } from "../ctx";

/** «Отмена» в «Откуда +N шт?»: штуки строки — как при открытии формы (новый вариант — 0). */
function useRevert(x: ProductCtx) {
  const { f, set, baseStockRef } = x;
  return (r: LotRaise) => {
    const base = baseStockRef.current;
    if (r.key === "") return set("stock", String(base.stock));
    set(
      "variants",
      f.variants.map((v, i) => {
        if (v.id ? v.id !== r.key : `new:${i}` !== r.key) return v;
        return { ...v, stock: v.id ? (base.variants[v.id] ?? 0) : 0 };
      })
    );
  };
}

function baseTotal(x: ProductCtx): number {
  const base = x.baseStockRef.current;
  return x.hasVariants ? Object.values(base.variants).reduce((a, n) => a + n, 0) : base.stock;
}

/** Остаток, склад по партиям, варианты и вопросы «Откуда +N шт?» (у вариантов — под ними). */
function StockSection({ x }: { x: ProductCtx }) {
  const { f, set, product, priceMinor, effectiveStock, hasVariants, lotSources, setLotSource } = x;
  const revert = useRevert(x);
  const raises = stockRaiseRows(f, x.baseStockRef.current);
  const questions = product?.id ? { productId: product.id, priceMinor, raises, answers: lotSources, onAnswer: setLotSource, onRevert: revert } : null;
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
  return (
    <>
      {questions ? (
        <StockLotsBlock
          {...questions}
          stock={hasVariants ? null : f.stock}
          total={effectiveStock}
          base={baseTotal(x)}
          onStock={(v) => set("stock", v)}
          fallback={stockInput}
        />
      ) : (
        stockInput
      )}
      <Variants variants={f.variants} onChange={(v) => set("variants", v)} />
      {questions && hasVariants && <RaiseQuestions {...questions} />}
    </>
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
      <StockSection x={x} />
      {product?.id && <WaitLine productId={product.id} title={product.title} />}
      {product?.id && effectiveStock === 0 && <FactoryOrderLine product={product} ProductPicker={ProductPickModal} />}
      {/* Только у сохранённого товара: размеры сохраняются отдельно от формы, своим эндпоинтом. */}
      {product?.id && <ParcelSizeEditor productId={product.id} />}
    </div>
  );
}
