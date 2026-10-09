"use client";

/**
 * Category dialog: «Основное» (name, slug, parent, menu, tile art), «SEO» (the category page,
 * Russian source) and «Характеристики» (the attribute schema: inherited from the parent / global
 * ones greyed out, own ones editable and sortable; saved one by one, right away).
 */
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Globe2, Layers, Lock, Pencil, Plus, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminApi,
  ApiError,
  type AdminCategory,
  type AdminSpecAttribute,
  type AdminSpecGroup,
} from "@/lib/api";
import {
  ART_KINDS,
  byOrder,
  groupAttributes,
  isLeaf,
  productsWord,
  SPEC_TYPE_LABEL,
} from "@/lib/catalog-admin";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { Spinner } from "@/components/ui/Spinner";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { AttributeDialog } from "./AttributeDialog";
import { GroupsDialog } from "./GroupsDialog";

type Tab = "main" | "seo" | "specs";

/** Limits of the backend columns (V36). */
const SEO_TITLE_MAX = 255;
const SEO_DESCRIPTION_MAX = 512;
const H1_MAX = 255;
const INTRO_MAX = 10_000;

function wordCount(text: string): number {
  const words = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

interface Form {
  name: string;
  slug: string;
  parentId: string;
  showInMenu: boolean;
  artKind: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  introText: string;
}

function toForm(c: AdminCategory | null, parentId: string | null): Form {
  return {
    name: c?.name ?? "",
    slug: c?.slug ?? "",
    parentId: (c ? c.parentId : parentId) ?? "",
    showInMenu: c?.showInMenu ?? true,
    artKind: c?.artKind ?? "",
    seoTitle: c?.seoTitle ?? "",
    seoDescription: c?.seoDescription ?? "",
    h1: c?.h1 ?? "",
    introText: c?.introText ?? "",
  };
}

export function CategoryDialog({
  open,
  category,
  presetParentId,
  categories,
  initialTab = "main",
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = new category. */
  category: AdminCategory | null;
  /** New subcategory of this root. */
  presetParentId: string | null;
  categories: AdminCategory[];
  initialTab?: Tab;
  onClose: () => void;
  onSaved: (c: AdminCategory) => void;
}) {
  const { push } = useToast();
  const qc = useQueryClient();
  const [confirm, confirmUi] = useConfirm();
  const [tab, setTab] = useState<Tab>("main");
  const [f, setF] = useState<Form>(() => toForm(category, presetParentId));
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [attrEditing, setAttrEditing] = useState<AdminSpecAttribute | null>(null);
  const [attrOpen, setAttrOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [busyAttr, setBusyAttr] = useState<string | null>(null);

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
  const ownProducts = category?.productCountDirect ?? 0;

  // Parent candidates: roots other than this one; a root with products of its own cannot get children.
  const roots = useMemo(() => categories.filter((c) => !c.parentId && c.id !== category?.id).sort(byOrder), [categories, category]);
  const blockedParents = roots.filter((r) => r.productCountDirect > 0 && r.id !== category?.parentId);
  const parentOptions = [
    { value: "", label: "— Корневая категория —" },
    ...roots.filter((r) => !blockedParents.includes(r)).map((r) => ({ value: r.id, label: r.name })),
  ];
  const parentName = categories.find((c) => c.id === (category?.parentId ?? f.parentId))?.name;

  const slugPreview = slugify(f.slug.trim() || f.name);
  const introWords = wordCount(f.introText);
  const seoSourceChanged =
    !!category &&
    (["seoTitle", "seoDescription", "h1", "introText"] as const).some((k) => f[k].trim() !== (category[k] ?? "").trim());

  // ---- characteristics ----
  const attrsQ = useQuery({
    queryKey: ["spec-attributes", category?.id ?? "none"],
    queryFn: () => adminApi.specAttributes(category!.id),
    enabled: open && !!category,
  });
  const groupsQ = useQuery({ queryKey: ["spec-groups"], queryFn: adminApi.specGroups, enabled: open, staleTime: 60_000 });
  const groups: AdminSpecGroup[] = groupsQ.data ?? [];
  const attrs = useMemo(() => {
    const list = attrsQ.data ?? [];
    // Inherited first (global, then parent), then own — each by sort.
    const rank = (a: AdminSpecAttribute) => (a.categoryId === null ? 0 : a.categoryId === category?.id ? 2 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder);
  }, [attrsQ.data, category]);
  const isOwn = (a: AdminSpecAttribute) => !a.inherited && a.categoryId === category?.id;
  const own = attrs.filter(isOwn);
  const grouped = groupAttributes(attrs, groups);
  const schemaKeys = ["spec-attributes", "catalog-schema"];

  function refreshAttrs() {
    for (const k of schemaKeys) qc.invalidateQueries({ queryKey: [k] });
  }

  async function moveAttr(a: AdminSpecAttribute, dir: -1 | 1) {
    const sameGroup = own.filter((x) => x.group === a.group);
    const i = sameGroup.findIndex((x) => x.id === a.id);
    const other = sameGroup[i + dir];
    if (!other) return;
    setBusyAttr(a.id);
    try {
      // Swap sort values (distinct ones if they were equal).
      const sa = a.sortOrder === other.sortOrder ? other.sortOrder + dir : other.sortOrder;
      await Promise.all([
        adminApi.updateSpecAttribute(a.id, { sortOrder: sa }),
        adminApi.updateSpecAttribute(other.id, { sortOrder: a.sortOrder }),
      ]);
      refreshAttrs();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось переставить", "error");
    } finally {
      setBusyAttr(null);
    }
  }

  async function removeAttr(a: AdminSpecAttribute) {
    const used = a.usedCount ?? 0;
    const ok = await confirm({
      title: `Удалить «${a.labelRu}»?`,
      message:
        used > 0
          ? `Характеристика заполнена в ${productsWord(used)} — значения будут вычищены из их карточек. Фильтр на витрине пропадёт.`
          : "Характеристика пропадёт из схемы категории и из фильтров витрины.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusyAttr(a.id);
    try {
      await adminApi.deleteSpecAttribute(a.id, used > 0);
      push("Характеристика удалена", "ok");
      refreshAttrs();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const force = await confirm({
          title: "Характеристика используется",
          message: `${e.message}. Удалить и вычистить значения из товаров?`,
          confirmLabel: "Удалить и вычистить",
          danger: true,
        });
        if (force) {
          try {
            await adminApi.deleteSpecAttribute(a.id, true);
            push("Характеристика удалена", "ok");
            refreshAttrs();
          } catch (e2) {
            push(e2 instanceof ApiError ? e2.message : "Не удалось удалить", "error");
          }
        }
      } else {
        push(e instanceof ApiError ? e.message : "Не удалось удалить", "error");
      }
    } finally {
      setBusyAttr(null);
    }
  }

  async function save() {
    if (!f.name.trim()) {
      setTab("main");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        slug: f.slug.trim(),
        // PATCH: null keeps — "" makes it a root / sets the tile art to «авто».
        parentId: category ? f.parentId : f.parentId || null,
        showInMenu: f.showInMenu,
        artKind: f.artKind,
        seoTitle: f.seoTitle.trim(),
        seoDescription: f.seoDescription.trim(),
        h1: f.h1.trim(),
        introText: f.introText.trim(),
      };
      let saved: AdminCategory;
      if (category) {
        saved = await adminApi.updateCategory(category.id, body);
      } else {
        const siblings = categories.filter((c) => (c.parentId ?? "") === f.parentId);
        saved = await adminApi.createCategory({
          ...body,
          sortOrder: siblings.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 10,
        });
      }
      push(category ? "Категория сохранена" : "Категория создана", "ok");
      setInitial(JSON.stringify(f));
      onSaved(saved);
      if (!category) onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  const highlightOthers = attrs.filter((a) => a.highlight && a.id !== attrEditing?.id).length;

  return (
    <>
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
        <Tabs<Tab>
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
        <>
          <div key={tab} className="tab-in">
            {tab === "main" && (
              <div className="flex flex-col gap-4">
                <Input
                  label="Название"
                  autoFocus
                  value={f.name}
                  maxLength={128}
                  onChange={(e) => set("name", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                  }}
                  placeholder="Например, Магнитные клавиатуры"
                />
                <Input
                  label="Адрес на сайте (slug)"
                  value={f.slug}
                  onChange={(e) => set("slug", e.target.value)}
                  placeholder={slugify(f.name) || "из названия"}
                  className="font-mono"
                  hint={
                    f.slug.trim()
                      ? `Страница: /catalog/${slugPreview || "…"}`
                      : `Пусто — из названия: /catalog/${slugPreview || "…"}`
                  }
                />
                {category && f.slug.trim() && slugify(f.slug) !== category.slug && (
                  <Note warn>
                    Смена адреса сломает старые ссылки: <span className="font-mono">/catalog/{category.slug}</span> перестанет открываться.
                  </Note>
                )}

                <div className="flex flex-col gap-1.5">
                  {hasChildren ? (
                    <>
                      <span className="field-label">Родитель</span>
                      <div className="flex h-10 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 text-[14px] text-[var(--text-muted)]">
                        <Lock className="h-3.5 w-3.5" /> Корневая
                      </div>
                      <span className="text-[12px] text-[var(--text-faint)]">
                        У категории есть подкатегории — она остаётся корневой (дерево в 2 уровня).
                      </span>
                    </>
                  ) : (
                    <>
                      <Select label="Родитель" value={f.parentId} onChange={(v) => set("parentId", v)} options={parentOptions} />
                      <span className="text-[12px] text-[var(--text-faint)]">
                        {f.parentId
                          ? `Подкатегория «${categories.find((c) => c.id === f.parentId)?.name ?? ""}»: её товары видны и на странице родителя.`
                          : "Корневая — пункт меню первого уровня."}
                        {blockedParents.length > 0 &&
                          ` Не могут быть родителем (в них лежат товары): ${blockedParents.map((b) => b.name).join(", ")}.`}
                      </span>
                    </>
                  )}
                </div>

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

                {category && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Stat label="На витрине" value={category.productCount} />
                    <Stat label={hasChildren ? "Прямо в разделе" : "Всего в категории"} value={ownProducts} />
                    {parentName && <Stat label="Родитель" value={parentName} />}
                  </div>
                )}
              </div>
            )}

            {tab === "seo" && (
              <div className="flex flex-col gap-4">
                <p className="text-[12.5px] leading-relaxed text-[var(--text-faint)]">
                  Текст на русском. Пустое поле — сайт берёт свой шаблон. Украинская и английская страницы используют поле, только
                  когда у него есть перевод (иначе — шаблон). Переводы — во вкладке{" "}
                  <Link href="/translations" className="font-semibold text-[var(--accent)] hover:underline">
                    «Переводы»
                  </Link>
                  , фильтр «Категории».
                </p>
                <Input
                  label="SEO-заголовок (title)"
                  value={f.seoTitle}
                  maxLength={SEO_TITLE_MAX}
                  onChange={(e) => set("seoTitle", e.target.value)}
                  placeholder={`${f.name || "Категория"} — купить в Украине`}
                  hint={`${f.seoTitle.length}/${SEO_TITLE_MAX} · вкладка браузера и выдача поиска (видно ~60 символов). Пусто — шаблон.`}
                />
                <Textarea
                  label="SEO-описание (description)"
                  rows={3}
                  maxLength={SEO_DESCRIPTION_MAX}
                  value={f.seoDescription}
                  onChange={(e) => set("seoDescription", e.target.value)}
                  placeholder="Пусто — шаблон: число товаров, цена «от», доставка"
                  hint={`${f.seoDescription.length}/${SEO_DESCRIPTION_MAX} · сниппет в поиске (видно ~160 символов)`}
                />
                <Input
                  label="Заголовок H1 (необязательно)"
                  value={f.h1}
                  maxLength={H1_MAX}
                  onChange={(e) => set("h1", e.target.value)}
                  placeholder={f.name || "по умолчанию — название"}
                  hint="Крупный заголовок на странице категории. Пусто — название."
                />
                <Textarea
                  label="SEO-текст категории"
                  rows={8}
                  maxLength={INTRO_MAX}
                  value={f.introText}
                  onChange={(e) => set("introText", e.target.value)}
                  placeholder="300–600 слов о категории: что это, как выбрать, чем отличаются товары. Абзацы — через пустую строку."
                  hint={`${introWords} слов${introWords > 0 && (introWords < 300 || introWords > 600) ? " · рекомендуем 300–600" : ""}`}
                />
                {seoSourceChanged && (
                  <Note>
                    После сохранения переводы изменённых SEO-полей устареют: пока их не обновят во вкладке «Переводы», украинская и
                    английская страницы будут на шаблоне сайта.
                  </Note>
                )}
              </div>
            )}

            {tab === "specs" &&
              (!category ? (
                <div className="hud-frame flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] px-6 py-10 text-center">
                  <SlidersHorizontal className="h-6 w-6 text-[var(--text-faint)]" />
                  <p className="text-[13px] text-[var(--text-muted)]">Сначала создайте категорию — затем добавьте её характеристики.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="max-w-md text-[12.5px] leading-snug text-[var(--text-faint)]">
                      {hasChildren
                        ? "Характеристики родителя наследуют все подкатегории — по ним фильтруется и страница родителя."
                        : "Свои характеристики категории. Серые — унаследованы от родителя или глобальные."}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => setGroupsOpen(true)}>
                        Группы
                      </Button>
                      <Button
                        size="sm"
                        variant="surface"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setAttrEditing(null);
                          setAttrOpen(true);
                        }}
                      >
                        Характеристика
                      </Button>
                    </div>
                  </div>

                  {attrsQ.isLoading ? (
                    <div className="grid place-items-center py-10">
                      <Spinner />
                    </div>
                  ) : attrsQ.isError ? (
                    <Note warn>
                      Не удалось загрузить характеристики.{" "}
                      <button type="button" className="font-semibold text-[var(--accent-hi)] hover:underline" onClick={() => attrsQ.refetch()}>
                        Повторить
                      </button>
                    </Note>
                  ) : attrs.length === 0 ? (
                    <div className="hud-frame flex flex-col items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line)] px-6 py-10 text-center">
                      <SlidersHorizontal className="h-6 w-6 text-[var(--accent)]" />
                      <p className="font-display text-[14px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">Характеристик нет</p>
                      <p className="max-w-sm text-[12.5px] text-[var(--text-muted)]">
                        Добавьте вес, сенсор, подключение… — по ним появятся фильтры на витрине и форма в карточке товара.
                      </p>
                    </div>
                  ) : (
                    grouped.map((g) => (
                      <div key={g.key} className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)]">
                        <div className="font-display flex items-center justify-between bg-[var(--bg-2)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                          <span>{g.label}</span>
                          <span className="tabular text-[var(--text-faint)]">{g.items.length}</span>
                        </div>
                        <ul>
                          {g.items.map((a) => {
                            const mine = isOwn(a);
                            const ownInGroup = own.filter((x) => x.group === a.group);
                            const idx = ownInGroup.findIndex((x) => x.id === a.id);
                            const from =
                              a.categoryId === null ? "глобальная" : `из «${categories.find((c) => c.id === a.categoryId)?.name ?? "родителя"}»`;
                            return (
                              <motion.li
                                layout
                                key={a.id}
                                className={cn(
                                  "group flex items-center gap-2 border-t border-[var(--line)] px-3 py-2 first:border-t-0",
                                  mine ? "hover:bg-[var(--surface-hover)]" : "bg-[color-mix(in_srgb,var(--bg-2)_60%,transparent)]"
                                )}
                              >
                                <button
                                  type="button"
                                  disabled={!mine}
                                  onClick={() => {
                                    setAttrEditing(a);
                                    setAttrOpen(true);
                                  }}
                                  className="focusable flex min-w-0 flex-1 flex-col items-start rounded-[var(--r-sm)] text-left disabled:cursor-default"
                                >
                                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                                    <span className={cn("truncate text-[14px] font-semibold", mine ? "text-[var(--text)]" : "text-[var(--text-muted)]")}>
                                      {a.labelRu}
                                      {a.unitRu ? <span className="font-normal text-[var(--text-faint)]">, {a.unitRu}</span> : null}
                                    </span>
                                    {a.required && <span className="text-[var(--accent-hi)]" title="Обязательная">*</span>}
                                  </span>
                                  <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--text-faint)]">
                                    <span className="font-mono">{a.key}</span>
                                    <span>· {SPEC_TYPE_LABEL[a.type]}{a.range ? " (от–до)" : ""}</span>
                                    {(a.type === "enum" || a.type === "multi") && <span>· {a.options.length} опц.</span>}
                                    {!mine && (
                                      <span className="inline-flex items-center gap-1">
                                        · {a.categoryId === null && <Globe2 className="h-3 w-3" />}
                                        {from}
                                      </span>
                                    )}
                                    {a.usedCount != null && <span>· {productsWord(a.usedCount)}</span>}
                                  </span>
                                </button>
                                <span className="hidden shrink-0 items-center gap-1 sm:flex">
                                  {a.filterable && <Badge tone="info" className="px-1.5">фильтр</Badge>}
                                  {a.highlight && <Badge tone="accent" className="px-1.5">карточка</Badge>}
                                </span>
                                {mine ? (
                                  <span className="flex shrink-0 items-center gap-0.5">
                                    {busyAttr === a.id ? (
                                      <Spinner className="mx-2 h-4 w-4" />
                                    ) : (
                                      <>
                                        <RowBtn label="Выше" disabled={idx <= 0} onClick={() => moveAttr(a, -1)}>
                                          <ArrowUp className="h-3.5 w-3.5" />
                                        </RowBtn>
                                        <RowBtn label="Ниже" disabled={idx < 0 || idx >= ownInGroup.length - 1} onClick={() => moveAttr(a, 1)}>
                                          <ArrowDown className="h-3.5 w-3.5" />
                                        </RowBtn>
                                        <RowBtn
                                          label="Изменить"
                                          onClick={() => {
                                            setAttrEditing(a);
                                            setAttrOpen(true);
                                          }}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </RowBtn>
                                        <RowBtn label="Удалить" danger onClick={() => removeAttr(a)}>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </RowBtn>
                                      </>
                                    )}
                                  </span>
                                ) : (
                                  <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" aria-label="Унаследована — меняется в своей категории" />
                                )}
                              </motion.li>
                            );
                          })}
                        </ul>
                      </div>
                    ))
                  )}
                  <p className="flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
                    <Settings2 className="h-3.5 w-3.5" /> * — обязательная: без неё карточка товара «неполная».
                  </p>
                </div>
              ))}
          </div>
        </>
      </Modal>

      {category && (
        <AttributeDialog
          open={attrOpen}
          attribute={attrEditing}
          categoryId={category.id}
          categoryName={category.name}
          groups={groups}
          takenKeys={attrs.map((a) => a.key)}
          highlightOthers={highlightOthers}
          onClose={() => setAttrOpen(false)}
          onSaved={() => refreshAttrs()}
        />
      )}
      <GroupsDialog
        open={groupsOpen}
        groups={groups}
        usedKeys={new Set(attrs.map((a) => a.group))}
        onClose={() => setGroupsOpen(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["spec-groups"] });
          qc.invalidateQueries({ queryKey: ["catalog-schema"] });
        }}
      />
      {confirmUi}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
      <div className="field-label !text-[10.5px] !text-[var(--text-faint)]">{label}</div>
      <div className="font-display tabular mt-0.5 truncate text-[15px] font-bold text-[var(--ink)]">{value}</div>
    </div>
  );
}

function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-md)] border p-2.5 text-[12.5px] leading-snug text-[var(--text)]",
        warn
          ? "border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
      )}
    >
      {children}
    </div>
  );
}

function RowBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "focusable grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] transition-colors disabled:opacity-25 pointer-coarse:h-10 pointer-coarse:w-10",
        danger
          ? "enabled:hover:bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] enabled:hover:text-[var(--danger-ink)]"
          : "enabled:hover:bg-[var(--surface-3)] enabled:hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}
