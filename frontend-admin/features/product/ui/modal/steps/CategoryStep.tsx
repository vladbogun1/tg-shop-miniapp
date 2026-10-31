"use client";

import { Spinner } from "@/components/ui/Spinner";
import { CategoryTreeSelect, plural } from "@/features/catalog";
import { Warning } from "../parts";
import type { ProductCtx } from "../ctx";
import { BrandBlock } from "./BrandBlock";
import { ConditionBlock } from "./ConditionBlock";
import { PublishToggle } from "./PublishToggle";

export function CategoryStep({ x }: { x: ProductCtx }) {
  const { f, catsQ, categories, categoryIsLeaf, droppedKeys, changeCategory } = x;
  return (
    <div className="flex flex-col gap-4">
      {catsQ.isLoading ? (
        <div className="grid place-items-center py-8">
          <Spinner />
        </div>
      ) : (
        <>
          <CategoryTreeSelect
            id="product-category"
            label="Категория"
            categories={categories}
            value={f.categoryId}
            onChange={changeCategory}
            mode="leaf"
            showCounts
            placeholder={categories.length ? "Выберите категорию" : "Категорий пока нет"}
            error={!categoryIsLeaf ? "У этой категории есть подкатегории — выберите одну из них" : undefined}
            hint={
              categories.length === 0
                ? "Создайте категории в разделе «Категории»."
                : "Только категория без подкатегорий. От неё зависят характеристики и фильтры."
            }
          />
          {!f.categoryId && (
            <p className="-mt-2 text-[12.5px] text-[var(--warn)]">Без категории товар не попадёт в каталог сайта и фильтры.</p>
          )}
          {droppedKeys.length > 0 && (
            <Warning compact>
              В новой категории нет {droppedKeys.length} {plural(droppedKeys.length, "характеристики", "характеристик", "характеристик")} (
              <span className="font-mono text-[12px]">{droppedKeys.slice(0, 5).join(", ")}</span>
              {droppedKeys.length > 5 ? "…" : ""}) — при сохранении их значения будут удалены.
            </Warning>
          )}
          <BrandBlock x={x} />
          <ConditionBlock x={x} />
          <PublishToggle x={x} />
        </>
      )}
    </div>
  );
}
