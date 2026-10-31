/** Что экран «Категории» считает из дерева: поиск, счётчики, варианты «Переместить в…», строки порядка. */
import { normText } from "./search";
import { byOrder, childrenOf, type TreeNode } from "./tree";
import type { AdminCategory, CategoryReorderItem } from "./types";

/** Дерево, сужённое поиском: родитель с совпавшим именем показывает всех детей, иначе — только совпавших. */
export function filterTree(tree: TreeNode[], nq: string): TreeNode[] {
  if (!nq) return tree;
  const hit = (c: AdminCategory) => normText(c.name).includes(nq) || c.slug.includes(nq);
  return tree
    .map((n) => ({ cat: n.cat, children: hit(n.cat) ? n.children : n.children.filter(hit) }))
    .filter((n) => hit(n.cat) || n.children.length > 0);
}

export function treeStats(tree: TreeNode[], categories: AdminCategory[]) {
  const roots = tree.length;
  const subs = categories.length - roots;
  const products = tree.reduce((s, n) => s + n.cat.productCount, 0);
  const hidden = categories.filter((c) => !c.showInMenu).length;
  return { roots, subs, products, hidden };
}

/** Число характеристик по категориям (из схемы каталога). */
export function attributeCounts(attributes: { categoryId: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of attributes) if (a.categoryId) m.set(a.categoryId, (m.get(a.categoryId) ?? 0) + 1);
  return m;
}

/** Куда можно переместить категорию: на верхний уровень или в корень без собственных товаров. */
export function moveOptions(categories: AdminCategory[], moving: AdminCategory | null): { value: string; label: string }[] {
  if (!moving) return [];
  const roots = categories.filter((c) => !c.parentId && c.id !== moving.id && c.productCountDirect === 0).sort(byOrder);
  return [
    ...(moving.parentId ? [{ value: "", label: "— На верхний уровень (корневая) —" }] : []),
    ...roots.filter((r) => r.id !== moving.parentId).map((r) => ({ value: r.id, label: r.name })),
  ];
}

export interface ReorderPlan {
  rows: CategoryReorderItem[];
  optimistic: AdminCategory[];
}

/** Сдвиг на одну позицию среди соседей; null, если двигать некуда. */
export function planShift(categories: AdminCategory[], c: AdminCategory, dir: -1 | 1): ReorderPlan | null {
  const siblings = childrenOf(categories, c.parentId ?? null);
  const i = siblings.findIndex((s) => s.id === c.id);
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return null;
  const next = [...siblings];
  [next[i], next[j]] = [next[j], next[i]];
  const rows = next.map((s, k) => ({ id: s.id, parentId: s.parentId ?? null, sortOrder: (k + 1) * 10 }));
  const order = new Map(rows.map((r) => [r.id, r.sortOrder]));
  return { rows, optimistic: categories.map((x) => (order.has(x.id) ? { ...x, sortOrder: order.get(x.id)! } : x)) };
}

/** Перенос в другого родителя (или в корень) — в конец списка соседей. */
export function planReparent(categories: AdminCategory[], moving: AdminCategory, parentId: string | null): ReorderPlan {
  const siblings = childrenOf(categories, parentId).filter((s) => s.id !== moving.id);
  const sortOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 10;
  return {
    rows: [{ id: moving.id, parentId, sortOrder }],
    optimistic: categories.map((x) => (x.id === moving.id ? { ...x, parentId, sortOrder } : x)),
  };
}

