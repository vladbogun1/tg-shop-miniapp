"use client";

import { useConfirm } from "@shop/ui/confirm";
import { childrenOf } from "../../model/tree";
import { planReorder, planReparent, planShift } from "../../model/tree-view";
import { planReparentMany } from "../../model/tree-filter";
import type { AdminCategory } from "../../model/types";
import { plural, productsWord } from "../../model/words";
import { useDeleteCategory, useReorderCategories } from "../../queries";

/** Действия над деревом категорий: сдвиг, перенос к другому родителю, удаление с объяснением отказов сервера. */
export function useCategoryActions(categories: AdminCategory[]) {
  const confirm = useConfirm();
  const reorder = useReorderCategories();
  const del = useDeleteCategory();

  function shift(c: AdminCategory, dir: -1 | 1) {
    const plan = planShift(categories, c, dir);
    if (plan) reorder.mutate(plan);
  }

  /** Перетаскивание: новый порядок соседей одного родителя одним запросом. */
  function reorderSiblings(parentId: string | null, orderedIds: string[]) {
    const plan = planReorder(categories, parentId, orderedIds);
    if (plan) reorder.mutate(plan);
  }

  function reparent(moving: AdminCategory, parentId: string | null) {
    const target = categories.find((c) => c.id === parentId);
    reorder.mutate({
      ...planReparent(categories, moving, parentId),
      message: target ? `«${moving.name}» теперь в «${target.name}»` : `«${moving.name}» — корневая категория`,
    });
  }

  /** Перенос нескольких категорий к одному родителю одним запросом порядка. */
  function reparentMany(moving: AdminCategory[], parentId: string | null) {
    const target = categories.find((c) => c.id === parentId);
    reorder.mutate({
      ...planReparentMany(categories, moving, parentId),
      message: `${moving.length === 1 ? `«${moving[0].name}»` : `Категорий: ${moving.length}`} — ${target ? `теперь в «${target.name}»` : "на верхнем уровне"}`,
    });
  }

  async function remove(c: AdminCategory) {
    const kids = childrenOf(categories, c.id).length;
    if (kids > 0) {
      await confirm({
        title: "Нельзя удалить",
        message: `В «${c.name}» ${kids} ${plural(kids, "подкатегория", "подкатегории", "подкатегорий")}. Сначала удалите их или перенесите в другую категорию.`,
        confirmLabel: "Понятно",
      });
      return;
    }
    if (c.productCountDirect > 0) {
      await confirm({
        title: "Нельзя удалить",
        message: `В «${c.name}» лежит ${productsWord(c.productCountDirect)}. Перенесите их в другую категорию (мастер товара, шаг «Категория»), затем удалите.`,
        confirmLabel: "Понятно",
      });
      return;
    }
    const ok = await confirm({
      title: `Удалить «${c.name}»?`,
      message: `Страница /catalog/${c.slug} исчезнет с сайта вместе с характеристиками этой категории. Действие необратимо.`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) del.mutate(c.id);
  }

  return { shift, reorderSiblings, reparent, reparentMany, remove, busyId: del.isPending ? del.variables : undefined };
}
