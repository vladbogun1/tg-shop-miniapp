/**
 * «Карточки»: схема каталога в виде, удобном для запроса к ИИ и проверки ответа (одинаковая, откуда бы её ни прислали:
 * бэкенд или файл), и помощники по дереву категорий. Чистый модуль: без React и без "@/".
 */

// ============================================================================
// Schema (normalized: the same shape whatever the backend / schema file sends)
// ============================================================================

export type CardSpecType = "number" | "enum" | "multi" | "bool" | "text";

export interface CardOption {
  value: string;
  labelRu: string;
  labelUk?: string | null;
  labelEn?: string | null;
  aliases: string[];
}

export interface CardAttribute {
  /** Backend id (needed to add an option); absent when the schema comes from a file. */
  id?: string | null;
  key: string;
  labelRu: string;
  labelUk?: string | null;
  labelEn?: string | null;
  type: CardSpecType;
  /** Russian unit ("г", "мм"); null = none. */
  unit: string | null;
  /** number only: stored as {min,max}. */
  range: boolean;
  group?: string | null;
  required: boolean;
  /** Hint for the AI / admin (ru). */
  hint: string | null;
  /** Category that defines it; null = global (all categories). */
  categorySlug: string | null;
  options: CardOption[];
  sort: number;
}

export interface CardCategory {
  id?: string | null;
  slug: string;
  nameRu: string;
  parentSlug: string | null;
  sort: number;
}

export interface CardSchema {
  categories: CardCategory[];
  attributes: CardAttribute[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** First non-empty string among the given keys (snake_case, camelCase, nested `labels.ru`…). */
function pick(o: Obj, ...keys: string[]): string | null {
  for (const k of keys) {
    if (k.includes(".")) {
      const [a, b] = k.split(".");
      const inner = o[a];
      if (isObj(inner)) {
        const s = str(inner[b]);
        if (s) return s;
      }
      continue;
    }
    const s = str(o[k]);
    if (s) return s;
  }
  return null;
}

function aliasesOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function typeOf(v: unknown): CardSpecType {
  const t = String(v ?? "").toLowerCase();
  return t === "number" || t === "enum" || t === "multi" || t === "bool" || t === "text" ? t : "text";
}

function normalizeOption(o: unknown): CardOption | null {
  if (typeof o === "string") return { value: o, labelRu: o, aliases: [] };
  if (!isObj(o)) return null;
  const value = pick(o, "value", "slug", "key");
  if (!value) return null;
  return {
    value,
    labelRu: pick(o, "label_ru", "labelRu", "labels.ru", "label", "name_ru", "nameRu") ?? value,
    labelUk: pick(o, "label_uk", "labelUk", "labels.uk"),
    labelEn: pick(o, "label_en", "labelEn", "labels.en"),
    aliases: aliasesOf(o.aliases),
  };
}

function normalizeAttribute(a: unknown, categorySlug: string | null, i: number): CardAttribute | null {
  if (!isObj(a)) return null;
  const key = pick(a, "key");
  if (!key) return null;
  const unitRaw = a.unit;
  const unit = isObj(unitRaw)
    ? str(unitRaw.ru)
    : str(unitRaw) ?? pick(a, "unit_ru", "unitRu", "units.ru");
  const options = (Array.isArray(a.options) ? a.options : []).map(normalizeOption).filter((x): x is CardOption => !!x);
  return {
    id: pick(a, "id"),
    key,
    labelRu: pick(a, "label_ru", "labelRu", "labels.ru", "label", "name") ?? key,
    labelUk: pick(a, "label_uk", "labelUk", "labels.uk"),
    labelEn: pick(a, "label_en", "labelEn", "labels.en"),
    type: typeOf(a.type),
    unit,
    range: a.range === true || a.is_range === true || a.isRange === true,
    group: pick(a, "group", "group_key", "groupKey"),
    required: a.required === true || a.required_for_ready === true || a.requiredForReady === true,
    hint: pick(a, "hint_ru", "hintRu", "hint"),
    categorySlug,
    options,
    sort: num(a.sort ?? a.sort_order ?? a.sortOrder, i),
  };
}

/**
 * Accepts both the schema file format (`schema-final.json`: categories[].attributes,
 * global_attributes, parent = slug, label_ru…) and the flat admin API format (categories with
 * id/parentId, attributes with categoryId, labelRu / labels.ru…).
 */
export function normalizeSchema(raw: unknown): CardSchema {
  const root = isObj(raw) ? raw : {};
  const rawCats = Array.isArray(root.categories) ? root.categories : [];
  const idToSlug = new Map<string, string>();
  for (const c of rawCats) if (isObj(c) && str(c.id) && str(c.slug)) idToSlug.set(String(c.id), String(c.slug));

  const categories: CardCategory[] = [];
  const attributes: CardAttribute[] = [];
  rawCats.forEach((c, i) => {
    if (!isObj(c)) return;
    const slug = pick(c, "slug");
    if (!slug) return;
    const parentRaw = c.parent ?? c.parentSlug ?? c.parent_slug ?? null;
    const parentId = str(c.parentId ?? c.parent_id);
    const parentSlug = str(parentRaw) ?? (parentId ? idToSlug.get(parentId) ?? null : null);
    categories.push({
      id: pick(c, "id"),
      slug,
      nameRu: pick(c, "name_ru", "nameRu", "names.ru", "name") ?? slug,
      parentSlug,
      sort: num(c.sort ?? c.sortOrder ?? c.sort_order, i),
    });
    if (Array.isArray(c.attributes)) {
      c.attributes.forEach((a, j) => {
        const n = normalizeAttribute(a, slug, j);
        if (n) attributes.push(n);
      });
    }
  });
  const globals = root.global_attributes ?? root.globalAttributes;
  if (Array.isArray(globals)) {
    globals.forEach((a, j) => {
      const n = normalizeAttribute(a, null, j);
      if (n) attributes.push(n);
    });
  }
  if (Array.isArray(root.attributes)) {
    root.attributes.forEach((a, j) => {
      if (!isObj(a)) return;
      const catId = str(a.categoryId ?? a.category_id);
      const catSlug = str(a.categorySlug ?? a.category_slug ?? a.category) ?? (catId ? idToSlug.get(catId) ?? null : null);
      const n = normalizeAttribute(a, catSlug, j);
      if (n) attributes.push(n);
    });
  }
  return { categories, attributes };
}

// ---- tree helpers ----------------------------------------------------------

export function categoryOf(schema: CardSchema, slug: string | null | undefined): CardCategory | null {
  return slug ? schema.categories.find((c) => c.slug === slug) ?? null : null;
}

/** Root → … → category. */
export function categoryPathOf(schema: CardSchema, slug: string | null | undefined): CardCategory[] {
  const out: CardCategory[] = [];
  let c = categoryOf(schema, slug);
  for (let guard = 0; c && guard < 10; guard++) {
    out.unshift(c);
    c = categoryOf(schema, c.parentSlug);
  }
  return out;
}

export function categoryPathName(schema: CardSchema, slug: string | null | undefined): string {
  return categoryPathOf(schema, slug).map((c) => c.nameRu).join(" › ");
}

export function isLeafCategory(schema: CardSchema, slug: string | null | undefined): boolean {
  return !!categoryOf(schema, slug) && !schema.categories.some((c) => c.parentSlug === slug);
}

/** Leaves in tree order (root sort, then child sort). */
export function leafCategories(schema: CardSchema): CardCategory[] {
  const bySort = (a: CardCategory, b: CardCategory) => a.sort - b.sort || a.nameRu.localeCompare(b.nameRu, "ru");
  const out: CardCategory[] = [];
  const walk = (parent: string | null) => {
    for (const c of schema.categories.filter((x) => x.parentSlug === parent).sort(bySort)) {
      if (schema.categories.some((x) => x.parentSlug === c.slug)) walk(c.slug);
      else out.push(c);
    }
  };
  walk(null);
  return out;
}

/** Leaves under a category (the category itself when it is a leaf). */
export function leavesUnder(schema: CardSchema, slug: string): CardCategory[] {
  return leafCategories(schema).filter((l) => categoryPathOf(schema, l.slug).some((c) => c.slug === slug));
}

/**
 * Attributes that apply to a category: global → root → … → the category, a deeper definition of
 * the same key wins. `includeGlobal=false` → only the category path.
 */
export function attributesForCategory(schema: CardSchema, slug: string | null | undefined, includeGlobal = true): CardAttribute[] {
  const path = categoryPathOf(schema, slug).map((c) => c.slug);
  const rank = new Map<string | null, number>();
  if (includeGlobal) rank.set(null, 0);
  path.forEach((s, i) => rank.set(s, i + 1));
  const byKey = new Map<string, CardAttribute>();
  const list = schema.attributes
    .filter((a) => rank.has(a.categorySlug))
    .sort((a, b) => rank.get(a.categorySlug)! - rank.get(b.categorySlug)! || a.sort - b.sort);
  for (const a of list) {
    if (byKey.has(a.key)) byKey.delete(a.key);
    byKey.set(a.key, a);
  }
  return list.filter((a) => byKey.get(a.key) === a);
}
