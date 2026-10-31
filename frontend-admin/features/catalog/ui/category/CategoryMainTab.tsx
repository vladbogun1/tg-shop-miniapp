"use client";

import { Lock } from "lucide-react";
import { useMemo } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import type { Form } from "../../model/category-form";
import { ART_KINDS } from "../../model/labels";
import { slugify } from "../../model/slug";
import { byOrder } from "../../model/tree";
import type { AdminCategory } from "../../model/types";
import { Note, Stat } from "./parts";

type SetField = <K extends keyof Form>(k: K, v: Form[K]) => void;

interface Props {
  f: Form;
  set: SetField;
  /** null = new category. */
  category: AdminCategory | null;
  categories: AdminCategory[];
  hasChildren: boolean;
  onEnter: () => void;
}

/** Родители-кандидаты: корни, кроме самой категории; корень со своими товарами не может получить детей. */
function parentCandidates(categories: AdminCategory[], category: AdminCategory | null) {
  const roots = categories.filter((c) => !c.parentId && c.id !== category?.id).sort(byOrder);
  const blocked = roots.filter((r) => r.productCountDirect > 0 && r.id !== category?.parentId);
  const options = [
    { value: "", label: "— Корневая категория —" },
    ...roots.filter((r) => !blocked.includes(r)).map((r) => ({ value: r.id, label: r.name })),
  ];
  return { blocked, options };
}

function SlugField({ f, set, category }: { f: Form; set: SetField; category: AdminCategory | null }) {
  const slugPreview = slugify(f.slug.trim() || f.name);
  const hint = f.slug.trim()
    ? `Страница: /catalog/${slugPreview || "…"}`
    : `Пусто — из названия: /catalog/${slugPreview || "…"}`;
  const changed = !!category && !!f.slug.trim() && slugify(f.slug) !== category.slug;
  return (
    <>
      <Input
        label="Адрес на сайте (slug)"
        value={f.slug}
        onChange={(e) => set("slug", e.target.value)}
        placeholder={slugify(f.name) || "из названия"}
        className="font-mono"
        hint={hint}
      />
      {changed && category && (
        <Note warn>
          Смена адреса сломает старые ссылки: <span className="font-mono">/catalog/{category.slug}</span> перестанет открываться.
        </Note>
      )}
    </>
  );
}

interface ParentProps {
  f: Form;
  set: SetField;
  categories: AdminCategory[];
  hasChildren: boolean;
  candidates: ReturnType<typeof parentCandidates>;
}

function ParentField({ f, set, categories, hasChildren, candidates }: ParentProps) {
  if (hasChildren) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="field-label">Родитель</span>
        <div className="flex h-10 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 text-[14px] text-[var(--text-muted)]">
          <Lock className="h-3.5 w-3.5" /> Корневая
        </div>
        <span className="text-[12px] text-[var(--text-faint)]">
          У категории есть подкатегории — она остаётся корневой (дерево в 2 уровня).
        </span>
      </div>
    );
  }
  const note = f.parentId
    ? `Подкатегория «${categories.find((c) => c.id === f.parentId)?.name ?? ""}»: её товары видны и на странице родителя.`
    : "Корневая — пункт меню первого уровня.";
  const blockedNote =
    candidates.blocked.length > 0
      ? ` Не могут быть родителем (в них лежат товары): ${candidates.blocked.map((b) => b.name).join(", ")}.`
      : "";
  return (
    <div className="flex flex-col gap-1.5">
      <Select label="Родитель" value={f.parentId} onChange={(v) => set("parentId", v)} options={candidates.options} />
      <span className="text-[12px] text-[var(--text-faint)]">
        {note}
        {blockedNote}
      </span>
    </div>
  );
}

function MenuFields({ f, set }: { f: Form; set: SetField }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Картинка плитки на сайте"
          value={f.artKind}
          onChange={(v) => set("artKind", v)}
          options={[{ value: "", label: "Авто (по адресу)" }, ...ART_KINDS.map((k) => ({ value: k.value, label: `${k.label} · ${k.value}` }))]}
        />
        <div className="flex flex-col justify-end">
          <div className="flex h-10 items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 pointer-coarse:h-11">
            <Toggle checked={f.showInMenu} onChange={(v) => set("showInMenu", v)} label="Показывать в меню" />
          </div>
        </div>
      </div>
      {!f.showInMenu && (
        <p className="-mt-2 text-[12px] text-[var(--text-faint)]">
          Скрытая из меню категория открывается по прямой ссылке и остаётся в фильтрах.
        </p>
      )}
    </>
  );
}

function CategoryStats({ category, hasChildren, parentName }: { category: AdminCategory; hasChildren: boolean; parentName?: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Stat label="На витрине" value={category.productCount} />
      <Stat label={hasChildren ? "Прямо в разделе" : "Всего в категории"} value={category.productCountDirect ?? 0} />
      {parentName && <Stat label="Родитель" value={parentName} />}
    </div>
  );
}

/** «Основное»: название, адрес, родитель, картинка плитки, меню, счётчики. */
export function CategoryMainTab({ f, set, category, categories, hasChildren, onEnter }: Props) {
  const candidates = useMemo(() => parentCandidates(categories, category), [categories, category]);
  const parentName = categories.find((c) => c.id === (category?.parentId ?? f.parentId))?.name;
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Название"
        autoFocus
        value={f.name}
        maxLength={128}
        onChange={(e) => set("name", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        placeholder="Например, Магнитные клавиатуры"
      />
      <SlugField f={f} set={set} category={category} />
      <ParentField f={f} set={set} categories={categories} hasChildren={hasChildren} candidates={candidates} />
      <MenuFields f={f} set={set} />
      {category && <CategoryStats category={category} hasChildren={hasChildren} parentName={parentName} />}
    </div>
  );
}
