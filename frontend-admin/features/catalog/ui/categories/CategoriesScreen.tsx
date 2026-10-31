"use client";

/**
 * «Категории» (route "/categories", formerly «Теги»): the 2-level catalog tree.
 *  - roots in menu order, subcategories indented under a guide line; a root without children is
 *    itself a leaf (products lie in it);
 *  - counters: products of the subtree / lying right in the category, «скрыта из меню»;
 *  - ↑↓ reorder within siblings (saved at once), «Переместить в…» (another root or to the top level),
 *    add a root / a subcategory, delete with the server's guards explained;
 *  - the dialog edits the basics, SEO and the characteristics schema (see CategoryDialog).
 * Deep link "/categories?edit=<id>" opens a category (the audit log links here).
 */
import { FolderTree, Layers, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { Button } from "@shop/ui/admin-button";
import { normText } from "../../model/search";
import { buildTree } from "../../model/tree";
import { attributeCounts, filterTree, treeStats } from "../../model/tree-view";
import type { AdminCategory } from "../../model/types";
import { useCatalogSchemaQuery, useCategoriesQuery, useSpecGroupsQuery } from "../../queries";
import { CategoryDialog, type CategoryTab } from "../category/CategoryDialog";
import { GroupsDialog } from "../GroupsDialog";
import { CategoriesToolbar } from "./CategoriesToolbar";
import { CategoryTree } from "./CategoryTree";
import { MoveCategoryModal } from "./MoveCategoryModal";
import { useCategoryActions } from "./use-category-actions";

type DialogState = { category: AdminCategory | null; parentId: string | null; tab?: CategoryTab };

/** Deep link from the audit log: opens the category once and clears `?edit=`. */
function useEditDeepLink(categories: AdminCategory[] | undefined, open: (d: DialogState) => void) {
  useEffect(() => {
    if (!categories || typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("edit");
    if (!id) return;
    const c = categories.find((x) => x.id === id);
    if (c) open({ category: c, parentId: c.parentId });
    sp.delete("edit");
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // `open` is a state setter: runs when the data arrives, as before.
  }, [categories, open]);
}

export function CategoriesScreen() {
  const q = useCategoriesQuery();
  const categories = useMemo(() => q.data ?? [], [q.data]);
  const groupsQ = useSpecGroupsQuery();
  const schemaQ = useCatalogSchemaQuery();
  const actions = useCategoryActions(categories);

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [moving, setMoving] = useState<AdminCategory | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const nq = normText(search);
  const visibleTree = useMemo(() => filterTree(tree, nq), [tree, nq]);
  const attrCount = useMemo(() => attributeCounts(schemaQ.data?.attributes ?? []), [schemaQ.data]);
  const stats = useMemo(() => treeStats(tree, categories), [tree, categories]);
  useEditDeepLink(q.data, setDialog);

  const openNew = (parentId: string | null) => setDialog({ category: null, parentId });
  const toggle = (id: string) =>
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <PageHeader
        title="Категории"
        subtitle="Дерево каталога, меню сайта и характеристики для фильтров"
        actions={
          <>
            <Button variant="outline" icon={<Layers className="h-4 w-4" />} onClick={() => setGroupsOpen(true)}>
              Группы характеристик
            </Button>
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openNew(null)}>
              Новая категория
            </Button>
          </>
        }
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка категорий…">
        {categories.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="Категорий пока нет"
            description="Создайте первую категорию — например, «Мыши». Подкатегории добавляются внутрь корневых."
            action={
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openNew(null)}>
                Новая категория
              </Button>
            }
          />
        ) : (
          <>
            <CategoriesToolbar search={search} onSearch={setSearch} stats={stats} />
            {visibleTree.length === 0 ? (
              <EmptyState icon={Search} title="Ничего не найдено" description="Проверьте написание или очистите поиск." />
            ) : (
              <CategoryTree
                tree={tree}
                visibleTree={visibleTree}
                categories={categories}
                searching={!!nq}
                collapsed={collapsed}
                onToggle={toggle}
                attrCount={attrCount}
                busyId={actions.busyId}
                actions={{
                  shift: actions.shift,
                  edit: (c, tab) => setDialog({ category: c, parentId: c.parentId, tab }),
                  addChild: openNew,
                  startMove: setMoving,
                  remove: actions.remove,
                }}
              />
            )}
            <p className="mt-4 text-[12px] leading-relaxed text-[var(--text-faint)]">
              Товар лежит ровно в одной категории без подкатегорий. Страница родителя на сайте показывает товары всех его
              подкатегорий. «Уценка» — не категория, а состояние товара: подборка /catalog/utsenka собирается сама.
            </p>
          </>
        )}
      </QueryState>

      <CategoryDialog
        open={!!dialog}
        category={dialog?.category ? categories.find((c) => c.id === dialog.category!.id) ?? dialog.category : null}
        presetParentId={dialog?.parentId ?? null}
        categories={categories}
        initialTab={dialog?.tab ?? "main"}
        onClose={() => setDialog(null)}
      />

      <MoveCategoryModal
        moving={moving}
        categories={categories}
        onClose={() => setMoving(null)}
        onMove={(m, parentId) => {
          setMoving(null);
          actions.reparent(m, parentId);
        }}
      />

      <GroupsDialog
        open={groupsOpen}
        groups={groupsQ.data ?? []}
        usedKeys={new Set((schemaQ.data?.attributes ?? []).map((a) => a.group))}
        onClose={() => setGroupsOpen(false)}
      />
    </div>
  );
}
