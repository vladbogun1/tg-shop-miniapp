/**
 * Old brand slugs. A brand has no page of its own: it is the `?brand=a,b` filter of /catalog,
 * /catalog/<category> and /search. When the admin renames a brand's slug, links with the old one
 * (bookmarks, indexed URLs) answer 301 to the same URL with the new slug — see middleware.ts.
 * Pure, so it is safe in the edge middleware.
 */

/** Of the `brand` query value (`a,b`), the slugs worth asking the backend about. */
export function brandSlugsOf(value: string | null | undefined): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.split(",")) {
    const s = raw.trim().toLowerCase();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 20);
}

/**
 * The `brand` value with every old slug replaced by its current one (no duplicates, order kept);
 * null when nothing changes — then there is nothing to redirect.
 */
export function rewriteBrandParam(value: string, current: Record<string, string>): string | null {
  const slugs = brandSlugsOf(value);
  let changed = false;
  const next: string[] = [];
  for (const s of slugs) {
    const to = Object.prototype.hasOwnProperty.call(current, s) ? current[s] : undefined;
    if (to) changed = true;
    const slug = to ?? s;
    if (!next.includes(slug)) next.push(slug);
  }
  return changed ? next.join(",") : null;
}

/** Paths whose `?brand=` filter is a brand link: catalog, category and search, in any locale. */
export function isBrandFilterPath(pathname: string): boolean {
  return /^(?:\/(?:ru|en))?\/(?:catalog(?:\/[^/]+)?|search)\/?$/.test(pathname);
}
