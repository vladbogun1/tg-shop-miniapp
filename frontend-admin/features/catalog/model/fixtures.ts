/** Фабрики для тестов модели: частичные объекты, приведённые к видам экрана. */
import type { AdminBrand, AdminCategory, AdminSpecAttribute, AdminSpecGroup } from "./types";

export const cat = (id: string, parentId: string | null = null, extra: Partial<AdminCategory> = {}): AdminCategory =>
  ({ id, slug: id, name: id, parentId, sortOrder: 0, showInMenu: true, productCount: 0, productCountDirect: 0, ...extra }) as AdminCategory;

export const attr = (key: string, extra: Partial<AdminSpecAttribute> = {}): AdminSpecAttribute =>
  ({
    id: key,
    categoryId: null,
    key,
    labelRu: key,
    labelUk: key,
    labelEn: key,
    type: "text",
    group: "main",
    required: false,
    sortOrder: 0,
    options: [],
    buckets: null,
    ...extra,
  }) as AdminSpecAttribute;

export const group = (key: string, sortOrder: number, labelRu = key): AdminSpecGroup =>
  ({ key, labelRu, labelUk: labelRu, labelEn: labelRu, sortOrder }) as AdminSpecGroup;

export const brand = (id: string, name: string, extra: Partial<AdminBrand> = {}): AdminBrand =>
  ({ id, name, slug: id, aliases: [], productCount: 0, logoMode: "MONO", ...extra }) as AdminBrand;
