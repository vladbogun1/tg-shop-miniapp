"use client";

import { Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { BrandCombobox, CategoryTreeSelect } from "@/features/catalog";
import { Input } from "@/components/ui/Input";
import { PhotoUploader } from "./PhotoUploader";
import { Variants } from "./Variants";
import type { ProductCtx } from "./ctx";

interface Props {
  x: ProductCtx;
  open: boolean;
  requestClose: () => void;
  closeConfirm: ReactNode;
}

/** Создание: один компактный экран — название, категория, цена и остаток, бренд, фото. Сохраняется скрытым черновиком. */
export function CreateProductModal({ x, open, requestClose, closeConfirm }: Props) {
  const { f, set, categories, catsQ, categoryIsLeaf, hasVariants, effectiveStock, changeCategory, brands, fileRef, uploading, uploadFiles, moveImage, saving, saveCreate, errors, showMissing, confirmClose } = x;
  const err = (k: keyof typeof errors) => (showMissing ? errors[k] : undefined);
  return (
    <Modal
      open={open}
      onClose={requestClose}
      size="lg"
      closeOnBackdrop={false}
      title="Новый товар"
      footer={
        confirmClose ? (
          closeConfirm
        ) : (
          <div className="flex w-full items-center justify-between gap-2">
            <Button variant="ghost" onClick={requestClose}>
              Отмена
            </Button>
            {/* 320-px phones: the full label is wider than the footer — «Создать с ИИ». */}
            <Button variant="accent" loading={saving} disabled={uploading} onClick={saveCreate} icon={<Wand2 className="h-4 w-4" />}>
              Создать <span className="max-[359px]:hidden">и оформить</span> с ИИ
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Название"
          autoFocus
          value={f.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Напр. VGN Dragonfly F1 Moba"
          error={err("title")}
          hint="Как у производителя: бренд и модель — по ним ИИ найдёт характеристики."
        />
        <CategoryTreeSelect
          id="new-product-category"
          label="Категория"
          categories={categories}
          value={f.categoryId}
          onChange={changeCategory}
          mode="leaf"
          showCounts
          placeholder={catsQ.isLoading ? "Загрузка…" : categories.length ? "Выберите категорию" : "Категорий пока нет"}
          error={err("category") ?? (!categoryIsLeaf ? "У этой категории есть подкатегории — выберите одну из них" : undefined)}
          hint={categories.length === 0 && !catsQ.isLoading ? "Создайте категории в разделе «Категории»." : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Цена, ₴"
            inputMode="decimal"
            value={f.priceMajor}
            onChange={(e) => set("priceMajor", e.target.value)}
            placeholder="0"
            error={err("price")}
          />
          <Input
            label="Остаток"
            inputMode="numeric"
            value={hasVariants ? String(effectiveStock) : f.stock}
            disabled={hasVariants}
            onChange={(e) => set("stock", e.target.value.replace(/[^\d]/g, ""))}
            error={err("stock")}
            hint={hasVariants ? "= сумма остатков вариантов" : undefined}
          />
        </div>
        <Variants variants={f.variants} onChange={(v) => set("variants", v)} />
        {err("variants") && <p className="-mt-2 text-[12px] text-[var(--danger-ink)]">{err("variants")}</p>}
        <BrandCombobox
          brands={brands}
          value={f.brand}
          onChange={(v) => set("brand", v)}
          label="Бренд · необязательно"
          hint="Пусто — ИИ определит бренд по названию."
        />
        <PhotoUploader
          fileRef={fileRef}
          imageKeys={f.imageKeys}
          uploading={uploading}
          onFiles={uploadFiles}
          onRemove={(i) => set("imageKeys", f.imageKeys.filter((_, j) => j !== i))}
          onReorder={moveImage}
          compact
        />
        <div className="flex items-start gap-2.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span>
            Товар сохранится <b className="text-[var(--text)]">скрытым черновиком</b>, и сразу откроется оформление с ИИ: описание,
            характеристики и переводы названия и описания на украинский и английский — одним ответом.
          </span>
        </div>
      </div>
    </Modal>
  );
}
