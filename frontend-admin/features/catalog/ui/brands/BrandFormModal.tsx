"use client";

import { Check } from "lucide-react";
import { useLayoutEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal } from "@shop/ui/overlay";
import { buildBrandBody, findDuplicate, toBrandForm, type BrandForm } from "../../model/brands";
import { normText } from "../../model/search";
import { slugify } from "../../model/slug";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";
import { useSaveBrand } from "../../queries";
import { BrandLogoField } from "../BrandLogoField";
import { TagInput } from "../TagInput";

/** Создание / правка бренда: название, slug, сайт, алиасы, логотип. */
export function BrandFormModal({
  open,
  editing,
  brands,
  onClose,
}: {
  open: boolean;
  /** null = new brand. */
  editing: AdminBrand | null;
  brands: AdminBrand[];
  onClose: () => void;
}) {
  const form = useForm<BrandForm>({ defaultValues: toBrandForm(editing) });
  const v = form.watch() as BrandForm;
  const set = <K extends keyof BrandForm>(k: K, val: BrandForm[K]) => form.setValue(k, val as never, { shouldDirty: true });
  const saveBrand = useSaveBrand();
  const saving = saveBrand.isPending;

  const { reset } = form;
  useLayoutEffect(() => {
    if (open) reset(toBrandForm(editing));
  }, [open, editing, reset]);

  const dupName = findDuplicate(brands, editing?.id, v.name);
  const slugPreview = slugify(v.slug.trim() || v.name);

  function save() {
    if (!v.name.trim()) return;
    saveBrand.mutate({ id: editing?.id, body: buildBrandBody(v) }, { onSuccess: onClose });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={open && form.formState.isDirty}
      title={editing ? `Бренд · ${editing.name}` : "Новый бренд"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button variant="accent" loading={saving} disabled={!v.name.trim()} icon={<Check className="h-4 w-4" />} onClick={save}>
            {editing ? "Сохранить" : "Создать"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Название"
          autoFocus
          value={v.name}
          maxLength={128}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Например, Attack Shark"
          error={dupName ? `Уже есть: «${dupName.name}»${normText(dupName.name) !== normText(v.name) ? " (алиас)" : ""}` : undefined}
        />
        <Input
          label="Slug"
          value={v.slug}
          className="font-mono"
          onChange={(e) => set("slug", e.target.value)}
          placeholder={slugify(v.name) || "из названия"}
          hint={`В адресах фильтров: /catalog?brand=${slugPreview || "…"}`}
        />
        <Input
          label="Сайт производителя"
          value={v.website}
          maxLength={255}
          inputMode="url"
          onChange={(e) => set("website", e.target.value)}
          placeholder="https://…"
          hint="Источник для ИИ при оформлении карточек."
        />
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Алиасы</span>
          <TagInput
            ariaLabel="Алиасы бренда"
            value={v.aliases}
            onChange={(a) => set("aliases", a)}
            placeholder="AttackShark, Attack-Shark, атак шарк…"
          />
          <span className="text-[12px] text-[var(--text-faint)]">
            Другие написания: по ним бренд узнаётся в ответах ИИ и при создании товара. Enter или запятая — добавить.
          </span>
        </div>
        <BrandLogoField
          name={v.name}
          value={v.logoUrl}
          mode={v.logoMode}
          onChange={(url) => set("logoUrl", url)}
          onModeChange={(m) => set("logoMode", m)}
        />
        {editing && (
          <p className="text-[12px] text-[var(--text-faint)]">
            {editing.productCount > 0 ? `У бренда ${productsWord(editing.productCount)}.` : "У бренда пока нет товаров."}
          </p>
        )}
      </div>
    </Modal>
  );
}
