/** Публичный API фичи «каталог»: справочники (категории, бренды, характеристики), экраны и общие виджеты. */
export { CategoriesScreen } from "./ui/categories/CategoriesScreen";
export { BrandsScreen } from "./ui/brands/BrandsScreen";
export { BrandCombobox, type BrandValue } from "./ui/BrandCombobox";
export { CardStatusBadge, ConditionBadge, ConfidenceDot } from "./ui/CardBits";
export { CategoryTreeSelect } from "./ui/CategoryTreeSelect";
export { SpecsForm } from "./ui/SpecsForm";

export { catalogKeys } from "./keys";
export { schemaApi } from "./api";
export {
  CATALOG_STALE_MS,
  invalidateCatalogDerived,
  useBrandsQuery,
  useCatalogSchemaQuery,
  useCategoriesQuery,
  useSpecAttributesQuery,
  useSpecGroupsQuery,
} from "./queries";

export * from "./model/types";
export type { CardChange, CardLast, CardMeta } from "./model/card-meta";
export * from "./model/labels";
export * from "./model/tree";
export * from "./model/attributes";
export * from "./model/identifiers";
export { plural, productsWord } from "./model/words";
export { slugify } from "./model/slug";
