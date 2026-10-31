/**
 * Вид справочника каталога в админке: ответы API (`Schemas[...]`) плюс те отличия, которые удобны экрану.
 * Порядок характеристик, групп и опций называется `sort` — как на проводе (OpenAPI). У категорий и брендов — `sortOrder`.
 */
import type { SpecType } from "@shop/core/catalog";
import type { Schemas } from "@shop/core/api/schemas";

export type BrandLogoMode = "MONO" | "ORIGINAL";

/** Категория 2-уровневого дерева (productCount — всё поддерево, productCountDirect — прямо в ней). */
export type AdminCategory = Omit<Schemas["AdminCategoryDto"], "depth" | "leaf">;

export type AdminBrand = Omit<Schemas["AdminBrandDto"], "logoMode"> & { logoMode: BrandLogoMode };

export type AdminSpecOption = Omit<Schemas["AdminOptionDto"], "sort" | "usedCount"> & {
  id?: string;
  sort: number;
  /** Товары, у которых в характеристиках эта опция (когда бэкенд сообщает). */
  usedCount?: number;
};

export type AdminSpecBucket = Omit<Schemas["AdminBucketDto"], "id">;

/** Характеристика на всех трёх языках — как её видит редактор. */
export type AdminSpecAttribute = Omit<
  Schemas["AdminSpecAttributeDto"],
  "sort" | "type" | "options" | "buckets" | "usedCount" | "unitRu" | "unitUk" | "unitEn" | "hint"
> & {
  type: SpecType;
  unitRu?: string | null;
  unitUk?: string | null;
  unitEn?: string | null;
  hint?: string | null;
  sort: number;
  buckets: AdminSpecBucket[] | null;
  options: AdminSpecOption[];
  /** Товары, у которых есть такой ключ. */
  usedCount?: number;
};

export type AdminSpecGroup = Omit<Schemas["AdminSpecGroupDto"], "sort"> & { sort: number };

/** Вся схема на всех языках (редактор, мастер, подсказка ИИ). */
export interface AdminCatalogSchema {
  categories: AdminCategory[];
  brands: AdminBrand[];
  groups: AdminSpecGroup[];
  attributes: AdminSpecAttribute[];
}

// ---- тела запросов -------------------------------------------------------------------

export interface CategoryWriteRequest {
  name: string;
  /** Пусто — сгенерировать из названия. */
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  showInMenu?: boolean;
  /** null — «авто» (по slug). */
  artKind?: string | null;
  /** SEO: не задано — оставить, "" — очистить. */
  seoTitle?: string;
  seoDescription?: string;
  h1?: string;
  introText?: string;
}

export interface CategoryReorderItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export interface BrandWriteRequest {
  name: string;
  slug?: string;
  aliases?: string[];
  website?: string;
  sortOrder?: number;
  /** "" убирает логотип; не задано — оставляет. */
  logoUrl?: string;
  logoMode?: BrandLogoMode;
}

export type SpecAttributeWriteRequest = Omit<AdminSpecAttribute, "id" | "inherited" | "usedCount">;
