"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@shop/ui/admin-button";
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
  const [form, setForm] = useState<BrandForm>(() => toBrandForm(editing));
  const [initial, setInitial] = useState("");
  const saveBrand = useSaveBrand();
  const saving = saveBrand.isPending;

  useEffect(() => {
    if (!open) return;
    const f = toBrandForm(editing);
    setForm(f);
    setInitial(JSON.stringify(f));
  }, [open, editing]);

  const dupName = findDuplicate(brands, editing?.id, form.name);
  const slugPreview = slugify(form.slug.trim() || form.name);

  function save() {
    if (!form.name.trim()) return;
    saveBrand.mutate({ id: editing?.id, body: buildBrandBody(form) }, { onSuccess: onClose });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={open && JSON.stringify(form) !== initial}
      title={editing ? `Бренд · ${editing.name}` : "Новый бренд"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button variant="accent" loading={saving} disabled={!form.name.trim()} icon={<Check className="h-4 w-4" />} onClick={save}>
            {editing ? "Сохранить" : "Создать"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Название"
          autoFocus
          value={form.name}
          maxLength={128}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Например, Attack Shark"
          error={dupName ? `Уже есть: «${dupName.name}»${normText(dupName.name) !== normText(form.name) ? " (алиас)" : ""}` : undefined}
        />
        <Input
          label="Slug"
          value={form.slug}
          className="font-mono"
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          placeholder={slugify(form.name) || "из названия"}
          hint={`В адресах фильтров: /catalog?brand=${slugPreview || "…"}`}
        />
        <Input
          label="Сайт производителя"
          value={form.website}
          maxLength={255}
          inputMode="url"
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://…"
          hint="Источник для ИИ при оформлении карточек."
        />
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Алиасы</span>
          <TagInput
            ariaLabel="Алиасы бренда"
            value={form.aliases}
            onChange={(v) => setForm({ ...form, aliases: v })}
            placeholder="AttackShark, Attack-Shark, атак шарк…"
          />
          <span className="text-[12px] text-[var(--text-faint)]">
            Другие написания: по ним бренд узнаётся в ответах ИИ и при создании товара. Enter или запятая — добавить.
          </span>
        </div>
        <BrandLogoField
          name={form.name}
          value={form.logoUrl}
          mode={form.logoMode}
          onChange={(v) => setForm((f) => ({ ...f, logoUrl: v }))}
          onModeChange={(m) => setForm((f) => ({ ...f, logoMode: m }))}
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
