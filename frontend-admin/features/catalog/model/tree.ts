/** Дерево категорий (2 уровня): порядок меню, дети, путь, поддерево. */
import type { AdminCategory } from "./types";

export function byOrder(a: AdminCategory, b: AdminCategory): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");
}

export function childrenOf(cats: AdminCategory[], parentId: string | null): AdminCategory[] {
  return cats.filter((c) => (c.parentId ?? null) === parentId).sort(byOrder);
}

export interface TreeNode {
  cat: AdminCategory;
  children: AdminCategory[];
}

/** Roots in menu order, each with its children; orphans (parent missing) count as roots. */
export function buildTree(cats: AdminCategory[]): TreeNode[] {
  const ids = new Set(cats.map((c) => c.id));
  return cats
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .sort(byOrder)
    .map((cat) => ({ cat, children: childrenOf(cats, cat.id) }));
}

export function categoryPathOf(cats: AdminCategory[], id: string | null | undefined): AdminCategory[] {
  const out: AdminCategory[] = [];
  let c = id ? cats.find((x) => x.id === id) : undefined;
  for (let guard = 0; c && guard < 10; guard++) {
    out.unshift(c);
    const pid = c.parentId;
    c = pid ? cats.find((x) => x.id === pid) : undefined;
  }
  return out;
}

export function pathLabel(cats: AdminCategory[], id: string | null | undefined): string {
  return categoryPathOf(cats, id)
    .map((c) => c.name)
    .join(" › ");
}

export function isLeaf(cats: AdminCategory[], id: string): boolean {
  return !cats.some((c) => c.parentId === id);
}

export function subtreeOf(cats: AdminCategory[], id: string): Set<string> {
  const out = new Set([id]);
  for (const c of cats) if (c.parentId === id) out.add(c.id);
  return out;
}
