/** «Категории»: чипы-фильтры, массовое перемещение (куда можно и почему нельзя). Чистые функции. */
import { byOrder, childrenOf, type TreeNode } from "./tree";
import type { ReorderPlan } from "./tree-view";
import type { AdminCategory } from "./types";

export type CategoryFilter = "hidden" | "nospecs" | "noproducts" | "seo";

export const CATEGORY_FILTER_LABEL: Record<CategoryFilter, string> = {
  hidden: "Скрытые",
  nospecs: "Без характеристик",
  noproducts: "Без товаров",
  seo: "С SEO",
};

const hasSeo = (c: AdminCategory) => !!(c.seoTitle || c.seoDescription || c.h1 || c.introText);

function matches(c: AdminCategory, f: CategoryFilter, attrCount: ReadonlyMap<string, number>): boolean {
  if (f === "hidden") return !c.showInMenu;
  if (f === "nospecs") return !attrCount.get(c.id);
  if (f === "noproducts") return c.productCount === 0;
  return hasSeo(c);
}

/** Число категорий, подходящих под каждый чип (для подписей). */
export function filterCounts(categories: AdminCategory[], attrCount: ReadonlyMap<string, number>): Record<CategoryFilter, number> {
  const out = { hidden: 0, nospecs: 0, noproducts: 0, seo: 0 };
  for (const c of categories) for (const f of Object.keys(out) as CategoryFilter[]) if (matches(c, f, attrCount)) out[f]++;
  return out;
}

/**
 * Дерево под чипами (все включённые — «И»): родитель, подходящий сам, показывает только подходящих детей,
 * а родитель, у которого подошли только дети, остаётся как контекст.
 */
export function filterTreeByChips(tree: TreeNode[], filters: ReadonlySet<CategoryFilter>, attrCount: ReadonlyMap<string, number>): TreeNode[] {
  if (filters.size === 0) return tree;
  const ok = (c: AdminCategory) => [...filters].every((f) => matches(c, f, attrCount));
  return tree
    .map((n) => ({ cat: n.cat, children: n.children.filter(ok) }))
    .filter((n) => ok(n.cat) || n.children.length > 0);
}

export interface MoveTarget {
  /** "" = верхний уровень. */
  value: string;
  label: string;
  /** Почему выбрать нельзя; нет причины — строка доступна. */
  reason?: string;
}

export interface MovePlanInfo {
  /** Что реально переместится. */
  movable: AdminCategory[];
  /** Корни с подкатегориями: дерево двухуровневое, их переносить нельзя. */
  blocked: AdminCategory[];
  targets: MoveTarget[];
}

/** Куда переместить выбранные: «Сделать корневой» и корни, с объяснением, почему часть строк недоступна. */
export function moveTargets(categories: AdminCategory[], moving: AdminCategory[]): MovePlanInfo {
  const blocked = moving.filter((m) => !m.parentId && childrenOf(categories, m.id).length > 0);
  const movable = moving.filter((m) => !blocked.includes(m));
  const ids = new Set(movable.map((m) => m.id));
  const roots = categories.filter((c) => !c.parentId).sort(byOrder);
  const targets: MoveTarget[] = [
    {
      value: "",
      label: "Сделать корневой",
      reason: movable.some((m) => m.parentId) ? undefined : "уже на верхнем уровне",
    },
    ...roots.map((r): MoveTarget => {
      let reason: string | undefined;
      if (ids.has(r.id)) reason = "это выбранная категория";
      else if (r.productCountDirect > 0) reason = `в ней лежат товары (${r.productCountDirect})`;
      else if (movable.length > 0 && movable.every((m) => m.parentId === r.id)) reason = "уже лежат здесь";
      return { value: r.id, label: r.name, reason };
    }),
  ];
  return { movable, blocked, targets };
}

/** Перенос нескольких категорий к одному родителю (или в корень) — в конец списка его детей, по порядку выбора. */
export function planReparentMany(categories: AdminCategory[], moving: AdminCategory[], parentId: string | null): ReorderPlan {
  const ids = new Set(moving.map((m) => m.id));
  const siblings = childrenOf(categories, parentId).filter((s) => !ids.has(s.id));
  let next = siblings.reduce((m, s) => Math.max(m, s.sortOrder), 0);
  const rows = moving.map((m) => ({ id: m.id, parentId, sortOrder: (next += 10) }));
  const order = new Map(rows.map((r) => [r.id, r]));
  return {
    rows,
    optimistic: categories.map((x) => {
      const r = order.get(x.id);
      return r ? { ...x, parentId, sortOrder: r.sortOrder } : x;
    }),
  };
}
