"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import type { FormLine, PickedProduct } from "../model/batch-form";

/** «Какой вариант?»: у товара с вариантами позиции добавляются по одной, уже добавленные отключены. */
export function VariantPickModal({
  product,
  lines,
  onAdd,
  onClose,
}: {
  product: PickedProduct | null;
  lines: FormLine[];
  onAdd: (p: PickedProduct, variantId: string | null, variantName: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={!!product} onClose={onClose} size="sm" title="Какой вариант?">
      <div className="flex flex-col gap-1.5">
        {product?.variants?.map((v) => {
          const added = lines.some((l) => l.productId === product.id && l.variantId === (v.id ?? null));
          return (
            <button
              key={v.id ?? v.name}
              type="button"
              disabled={added}
              onClick={() => onAdd(product, v.id ?? null, v.name)}
              className="card-2 flex items-center justify-between gap-2 p-3 text-left text-[14px] hover:border-[var(--line-strong)] disabled:opacity-50"
            >
              <span className="font-semibold text-[var(--text)]">{v.name}</span>
              <span className="tabular text-[12px] text-[var(--text-faint)]">{added ? "добавлен" : `${v.stock} шт`}</span>
            </button>
          );
        })}
        <Button variant="accent" className="mt-2" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Modal>
  );
}
