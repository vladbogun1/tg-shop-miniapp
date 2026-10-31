"use client";

/**
 * Category dialog: «Основное» (name, slug, parent, menu, tile art), «SEO» (the category page,
 * Russian source) and «Характеристики» (the attribute schema: inherited from the parent / global
 * ones greyed out, own ones editable and sortable; saved one by one, right away).
 */
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { Tabs } from "@/components/ui/Tabs";
import {
  buildCategoryBody,
  nextSortOrder,
  SEO_SOURCE_KEYS,
  toForm,
  type Form,
} from "../../model/category-form";
import { isLeaf } from "../../model/tree";
import type { AdminCategory } from "../../model/types";
import { useSaveCategory, useSpecAttributesQuery } from "../../queries";
import { CategoryMainTab } from "./CategoryMainTab";
import { CategorySeoTab } from "./CategorySeoTab";
import { CategorySpecsTab } from "./CategorySpecsTab";

export type CategoryTab = "main" | "seo" | "specs";

export function CategoryDialog({
  open,
  category,
  presetParentId,
  categories,
  initialTab = "main",
  onClose,
}: {
  open: boolean;
  /** null = new category. */
  category: AdminCategory | null;
  /** New subcategory of this root. */
  presetParentId: string | null;
  categories: AdminCategory[];
  initialTab?: CategoryTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<CategoryTab>("main");
  const [f, setF] = useState<Form>(() => toForm(category, presetParentId));
  const [initial, setInitial] = useState("");
  const saveCategory = useSaveCategory();
  const saving = saveCategory.isPending;
  const attrsQ = useSpecAttributesQuery(category?.id, open && !!category);

  useEffect(() => {
    if (!open) return;
    const fresh = toForm(category, presetParentId);
    setF(fresh);
    setInitial(JSON.stringify(fresh));
    setTab(category ? initialTab : "main");
  }, [open, category, presetParentId, initialTab]);

  const dirty = open && JSON.stringify(f) !== initial;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const hasChildren = !!category && !isLeaf(categories, category.id);
  const seoSourceChanged =
    !!category && SEO_SOURCE_KEYS.some((k) => f[k].trim() !== (category[k] ?? "").trim());

  function save() {
    if (!f.name.trim()) {
      setTab("main");
      return;
    }
    const body = buildCategoryBody(f, !!category);
    saveCategory.mutate(
      { id: category?.id, body: category ? body : { ...body, sortOrder: nextSortOrder(categories, f.parentId) } },
      {
        onSuccess: () => {
          setInitial(JSON.stringify(f));
          if (!category) onClose();
        },
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      fixedHeight
      closeOnBackdrop={false}
      dirty={dirty}
      title={category ? `Категория · ${category.name}` : f.parentId ? "Новая подкатегория" : "Новая категория"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[12px] text-[var(--text-faint)]">
            {tab === "specs" ? "Характеристики сохраняются сразу" : category ? `/catalog/${category.slug}` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              {category && !dirty ? "Закрыть" : "Отмена"}
            </Button>
            {tab !== "specs" && (
              <Button
                variant="accent"
                loading={saving}
                disabled={!f.name.trim() || (!!category && !dirty)}
                icon={<Check className="h-4 w-4" />}
                onClick={save}
              >
                {category ? "Сохранить" : "Создать"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Tabs<CategoryTab>
        className="-mt-1 mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: "main", label: "Основное" },
          { value: "seo", label: "SEO" },
          { value: "specs", label: "Характеристики", count: category ? attrsQ.data?.length : undefined },
        ]}
      />

      {/* Plain div + CSS fade (see .tab-in in globals.css): a keyed framer element here left the
          Modal's exit unfinished after a tab switch, and an invisible dialog swallowed clicks. */}
      <div key={tab} className="tab-in">
        {tab === "main" && (
          <CategoryMainTab f={f} set={set} category={category} categories={categories} hasChildren={hasChildren} onEnter={save} />
        )}
        {tab === "seo" && <CategorySeoTab f={f} set={set} seoSourceChanged={seoSourceChanged} />}
        {tab === "specs" && <CategorySpecsTab open={open} category={category} categories={categories} hasChildren={hasChildren} />}
      </div>
    </Modal>
  );
}
