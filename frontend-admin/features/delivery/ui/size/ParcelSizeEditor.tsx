"use client";

/**
 * Вес и коробка товара и его вариантов для Новой Почты — свой эндпоинт, сохраняется отдельно от формы товара.
 * Пустое поле = «наследовать» (вариант → товар → категория → настройки); откуда взялись цифры, видно в окне ТТН.
 */
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { QueryState } from "@/components/ui/QueryState";
import { EMPTY_SIZE, productForms, productSizeBody, productSizeDirty, type ProductSizeForms } from "../../model/size-form";
import type { ProductSize } from "../../model/types";
import { useProductSizeQuery, useSaveProductSize } from "../../queries";
import { SizeInputs } from "./SizeInputs";

export function ParcelSizeEditor({ productId }: { productId: string }) {
  const q = useProductSizeQuery(productId);
  return (
    <section className="card-2 min-w-0 rounded-[var(--r-lg)] p-3 sm:p-4" aria-label="Вес и размеры для Новой Почты">
      <h3 className="section-title !text-[12px] !text-[var(--text-muted)]">Вес и коробка · Новая Почта</h3>
      <p className="mb-3 mt-1 text-[12.5px] leading-snug text-[var(--text-muted)]">
        Пусто — берётся из размеров категории или из настроек. Вес в граммах, коробка в сантиметрах.
      </p>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        {/* key: новая копия с сервера (после сохранения) заново заполняет поля. */}
        {q.data && <SizeFields key={JSON.stringify(q.data)} productId={productId} data={q.data} />}
      </QueryState>
    </section>
  );
}

function SizeFields({ productId, data }: { productId: string; data: ProductSize }) {
  const [forms, setForms] = useState<ProductSizeForms>(() => productForms(data));
  const save = useSaveProductSize(productId);
  const dirty = productSizeDirty(data, forms);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="field-label">Товар целиком</span>
        <SizeInputs form={forms.product} onChange={(product) => setForms((f) => ({ ...f, product }))} idPrefix="Товар" />
      </div>
      {data.variants.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="field-label">Варианты</span>
          {data.variants.map((v) => (
            <div key={v.id} className="flex min-w-0 flex-col gap-1.5">
              <span className="min-w-0 break-words text-[13px] font-semibold text-[var(--text)]">{v.name}</span>
              <SizeInputs
                form={forms.variants[v.id] ?? EMPTY_SIZE}
                onChange={(s) => setForms((f) => ({ ...f, variants: { ...f.variants, [v.id]: s } }))}
                idPrefix={v.name}
              />
            </div>
          ))}
        </div>
      )}
      <div>
        <Button
          size="sm"
          variant={dirty ? "accent" : "surface"}
          disabled={!dirty}
          loading={save.isPending}
          onClick={() => save.mutate(productSizeBody(data, forms))}
        >
          Сохранить размеры
        </Button>
      </div>
    </div>
  );
}
