/**
 * Category tree of the menus (header dropdown, burger sheet, footer, catalog sidebar, home tiles)
 * from the flat `/api/public/categories` list (catalog v2 adds `parentId`/`artKind`). Pure — safe
 * for client components.
 */
import { MARKDOWN_COLLECTION_SLUG, type PublicCategory } from "@shop/shared";

export interface MenuNode {
  id: string;
  slug: string;
  name: string;
  productCount: number;
  artKind?: string | null;
  children: MenuNode[];
}

const bySort = (a: PublicCategory, b: PublicCategory) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * Roots (in menu order) with their subcategories from the flat `/api/public/categories` list.
 * Empty categories are left out unless `keep` names them (the page the visitor is on); the virtual
 * «Уценка» stays last. A category whose parent is not in the list is shown as a root.
 */
export function menuTree(categories: PublicCategory[], keep?: string | null): MenuNode[] {
  const visible = (c: PublicCategory) => c.productCount > 0 || c.slug === keep;
  const ids = new Set(categories.map((c) => c.id));
  const node = (c: PublicCategory): MenuNode => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    productCount: c.productCount,
    artKind: c.artKind ?? (c.slug === MARKDOWN_COLLECTION_SLUG ? "sale" : null),
    children: categories
      .filter((x) => x.parentId === c.id && visible(x))
      .sort(bySort)
      .map(node),
  });
  const roots = categories.filter((c) => (!c.parentId || !ids.has(c.parentId)) && c.slug !== MARKDOWN_COLLECTION_SLUG);
  const keepRoot = keep ? categories.find((c) => c.slug === keep) : null;
  const keepRootId = keepRoot?.parentId && ids.has(keepRoot.parentId) ? keepRoot.parentId : keepRoot?.id;
  const out = roots
    .filter((c) => visible(c) || c.id === keepRootId)
    .sort(bySort)
    .map(node);
  const sale = categories.find((c) => c.slug === MARKDOWN_COLLECTION_SLUG);
  if (sale && visible(sale)) out.push(node(sale));
  return out;
}

/** The root a slug belongs to (itself for a root); null when unknown. */
export function rootOf(tree: MenuNode[], slug: string | null | undefined): MenuNode | null {
  if (!slug) return null;
  return tree.find((r) => r.slug === slug || r.children.some((c) => c.slug === slug)) ?? null;
}

