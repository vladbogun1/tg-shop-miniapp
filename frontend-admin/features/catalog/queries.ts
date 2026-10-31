"use client";

import { ApiError, errorMessage } from "@shop/core/errors";
import { QUERY_PRESETS } from "@shop/core/query";
import { useConfirm } from "@shop/ui/confirm";
import { useApiMutation, type ApiMutationConfig } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useIsSuperAdmin } from "@/features/staff";
import { invalidateTranslations } from "@/features/translation";
import { brandApi, categoryApi, schemaApi, specApi } from "./api";
import { catalogKeys } from "./keys";
import { productsWord } from "./model/words";
import type {
  AdminSpecAttribute,
  AdminSpecGroup,
  BrandWriteRequest,
  CategoryReorderItem,
  CategoryWriteRequest,
  AdminCategory,
  SpecAttributeWriteRequest,
} from "./model/types";

/** 60 с — как у этих запросов до выноса в фичу. */
const MINUTE_MS = QUERY_PRESETS.list.staleTime * 2;
/** Для потребителей, которые держали свои запросы справочников с тем же сроком. */
export const CATALOG_STALE_MS = MINUTE_MS;

interface QueryOpts {
  enabled?: boolean;
  /** Не задан — по умолчанию приложения (не передаём `undefined`, он сбросил бы его в 0). */
  staleTime?: number;
}

function withOpts({ enabled, staleTime }: QueryOpts = {}) {
  return { ...(enabled !== undefined ? { enabled } : {}), ...(staleTime !== undefined ? { staleTime } : {}) };
}

// ---- чтение ----------------------------------------------------------------------------

export function useCategoriesQuery(opts?: QueryOpts) {
  return useQuery({ queryKey: catalogKeys.categories(), queryFn: categoryApi.list, ...withOpts(opts) });
}

export function useBrandsQuery(opts?: QueryOpts) {
  return useQuery({ queryKey: catalogKeys.brands(), queryFn: brandApi.list, ...withOpts(opts) });
}

export function useSpecGroupsQuery(opts?: Pick<QueryOpts, "enabled">) {
  return useQuery({
    queryKey: catalogKeys.specGroups(),
    queryFn: specApi.groups,
    staleTime: MINUTE_MS,
    ...withOpts(opts),
  });
}

/** Вся схема каталога (категории, бренды, группы, характеристики) в виде редактора. */
export function useCatalogSchemaQuery(opts?: Pick<QueryOpts, "enabled">) {
  return useQuery({
    queryKey: catalogKeys.schema(),
    queryFn: schemaApi.get,
    staleTime: MINUTE_MS,
    ...withOpts(opts),
  });
}

/** Свои + унаследованные характеристики категории. */
export function useSpecAttributesQuery(categoryId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: catalogKeys.specAttributes(categoryId ?? "none"),
    queryFn: () => specApi.attributes(categoryId),
    enabled,
  });
}

// ---- инвалидация -----------------------------------------------------------------------

/**
 * После любой записи справочника: счётчик и списки «Карточек», экраны товаров и «Переводы» (переименование
 * категории/бренда добавляет там тексты). `schemaToo` — ещё и схемы каталога (обязательное поле двигает
 * карточки между вкладками).
 */
export function invalidateCatalogDerived(qc: QueryClient, schemaToo = false): void {
  qc.invalidateQueries({ queryKey: catalogKeys.cardsStats() });
  qc.invalidateQueries({ queryKey: catalogKeys.cardsExport() });
  qc.invalidateQueries({ queryKey: catalogKeys.productsRoot() });
  invalidateTranslations(qc);
  if (schemaToo) {
    qc.invalidateQueries({ queryKey: catalogKeys.cardSchema() });
    qc.invalidateQueries({ queryKey: catalogKeys.catalogRoot() });
  }
}

/** Запись справочника: после успеха ещё и производные кэши (см. `invalidateCatalogDerived`). */
function useCatalogMutation<TData, TVars = void>(config: ApiMutationConfig<TData, TVars>) {
  const qc = useQueryClient();
  return useApiMutation<TData, TVars>({
    ...config,
    onSuccess: async (data, vars) => {
      invalidateCatalogDerived(qc, true);
      await config.onSuccess?.(data, vars);
    },
  });
}

// ---- категории -------------------------------------------------------------------------

const CATEGORY_KEYS = [catalogKeys.categories(), catalogKeys.schema()] as const;

export function useSaveCategory() {
  return useCatalogMutation({
    mutationFn: (v: { id?: string; body: CategoryWriteRequest }) =>
      v.id ? categoryApi.update(v.id, v.body) : categoryApi.create(v.body),
    success: (_d, v) => (v.id ? "Категория сохранена" : "Категория создана"),
    errorFallback: "Не удалось сохранить",
    invalidate: CATEGORY_KEYS,
  });
}

/** Порядок/родитель: дерево меняется сразу, при ошибке возвращается как было. */
export function useReorderCategories() {
  return useCatalogMutation({
    mutationFn: (v: { rows: CategoryReorderItem[]; optimistic: AdminCategory[]; message?: string }) => categoryApi.reorder(v.rows),
    optimistic: { key: catalogKeys.categories(), apply: (_old, v) => v.optimistic },
    success: (_d, v) => v.message,
    errorFallback: "Не удалось сохранить порядок",
    invalidate: CATEGORY_KEYS,
  });
}

const DELETE_CATEGORY_TEXT: Record<string, string> = {
  CATEGORY_HAS_PRODUCTS: "В категории есть товары — перенесите их и попробуйте снова",
  CATEGORY_HAS_CHILDREN: "У категории есть подкатегории — сначала удалите или перенесите их",
};

export function useDeleteCategory() {
  return useCatalogMutation({
    mutationFn: (id: string) => categoryApi.remove(id),
    success: "Категория удалена",
    toastOnError: false,
    onError: (e) => {
      const known = e instanceof ApiError && e.code ? DELETE_CATEGORY_TEXT[e.code] : undefined;
      toast.error(known ?? errorMessage(e, undefined, "Не удалось удалить"));
    },
    invalidate: CATEGORY_KEYS,
  });
}

// ---- бренды ----------------------------------------------------------------------------

const BRAND_KEYS = [catalogKeys.brands(), catalogKeys.schema()] as const;

export function useSaveBrand() {
  return useCatalogMutation({
    mutationFn: (v: { id?: string; body: BrandWriteRequest }) => (v.id ? brandApi.update(v.id, v.body) : brandApi.create(v.body)),
    success: (_d, v) => (v.id ? "Бренд сохранён" : "Бренд создан"),
    errorFallback: "Не удалось сохранить",
    invalidate: BRAND_KEYS,
  });
}

export function useDeleteBrand() {
  return useCatalogMutation({
    mutationFn: (id: string) => brandApi.remove(id),
    success: "Бренд удалён",
    errorFallback: "Не удалось удалить",
    invalidate: BRAND_KEYS,
  });
}

export function useMergeBrand() {
  return useCatalogMutation({
    mutationFn: (v: { id: string; targetId: string; name: string; targetName: string }) => brandApi.merge(v.id, v.targetId),
    success: (_d, v) => `«${v.name}» объединён с «${v.targetName}»`,
    errorFallback: "Не удалось объединить",
    invalidate: BRAND_KEYS,
  });
}

// ---- характеристики --------------------------------------------------------------------

const ATTRIBUTE_KEYS = [catalogKeys.specAttributes(), catalogKeys.schema()] as const;

export interface SaveAttributeArgs {
  attribute: AdminSpecAttribute | null;
  body: SpecAttributeWriteRequest;
  force: boolean;
}

/**
 * Сохранить характеристику. 409 при правке (опции используются в товарах) — спросить «удалить и вычистить?»
 * и повторить с force. Возвращает true, если сохранено.
 */
export function useSaveAttribute() {
  const confirm = useConfirm();
  const m = useCatalogMutation({
    mutationFn: (v: SaveAttributeArgs) =>
      v.attribute ? specApi.updateAttribute(v.attribute.id, v.body, v.force) : specApi.createAttribute(v.body),
    success: (_d, v) => (v.attribute ? "Характеристика сохранена" : "Характеристика добавлена"),
    toastOnError: false,
    invalidate: ATTRIBUTE_KEYS,
  });
  async function save(args: SaveAttributeArgs): Promise<boolean> {
    try {
      await m.mutateAsync(args);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && args.attribute && !args.force) {
        const ok = await confirm({
          title: "Опции используются в товарах",
          message: `${e.message}. Удалить их и вычистить значения из характеристик товаров? Лучше объединить опцию с другой — кнопка «Объединить» у опции.`,
          confirmLabel: "Удалить и вычистить",
          danger: true,
        });
        return ok ? save({ ...args, force: true }) : false;
      }
      toast.error(errorMessage(e, undefined, "Не удалось сохранить"));
      return false;
    }
  }
  return save;
}

/** Две характеристики меняются местами в порядке. */
export function useSwapAttributes() {
  return useCatalogMutation({
    mutationFn: (v: { a: AdminSpecAttribute; other: AdminSpecAttribute; dir: -1 | 1 }) => {
      // Swap sort values (distinct ones if they were equal).
      const sa = v.a.sort === v.other.sort ? v.other.sort + v.dir : v.other.sort;
      return Promise.all([
        specApi.updateAttribute(v.a.id, { sort: sa }),
        specApi.updateAttribute(v.other.id, { sort: v.a.sort }),
      ]);
    },
    errorFallback: "Не удалось переставить",
    invalidate: ATTRIBUTE_KEYS,
  });
}

/**
 * Удалить характеристику: подтверждение, «с очисткой значений» (force) — только главному админу;
 * 409 на лету — ещё одно подтверждение.
 */
export function useRemoveAttribute() {
  const confirm = useConfirm();
  const superAdmin = useIsSuperAdmin();
  const m = useCatalogMutation({
    mutationFn: (v: { id: string; force: boolean }) => specApi.removeAttribute(v.id, v.force),
    success: "Характеристика удалена",
    toastOnError: false,
    invalidate: ATTRIBUTE_KEYS,
  });

  async function onConflict(a: AdminSpecAttribute, e: ApiError) {
    if (superAdmin !== true) {
      toast.error(`${e.message}. Удалить с очисткой значений может только главный админ`);
      return;
    }
    const force = await confirm({
      title: "Характеристика используется",
      message: `${e.message}. Удалить и вычистить значения из товаров?`,
      confirmLabel: "Удалить и вычистить",
      danger: true,
    });
    if (!force) return;
    try {
      await m.mutateAsync({ id: a.id, force: true });
    } catch (e2) {
      toast.error(errorMessage(e2, undefined, "Не удалось удалить"));
    }
  }

  return async function remove(a: AdminSpecAttribute): Promise<void> {
    const used = a.usedCount ?? 0;
    // Removing a filled characteristic wipes its values from products (force=1): the main admin only.
    if (used > 0 && superAdmin !== true) {
      toast.error(`Характеристика заполнена в ${productsWord(used)} — удалить её с очисткой значений может только главный админ`);
      return;
    }
    const ok = await confirm({
      title: `Удалить «${a.labelRu}»?`,
      message:
        used > 0
          ? `Характеристика заполнена в ${productsWord(used)} — значения будут вычищены из их карточек. Фильтр на витрине пропадёт.`
          : "Характеристика пропадёт из схемы категории и из фильтров витрины.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    try {
      await m.mutateAsync({ id: a.id, force: used > 0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await onConflict(a, e);
      else toast.error(errorMessage(e, undefined, "Не удалось удалить"));
    }
  };
}

/** «Объединить опцию с…»: товары переписываются на другое значение (кэш не трогаем — как раньше). */
export function useMergeOption() {
  return useApiMutation({
    mutationFn: (v: { attributeId: string; from: string; to: string }) => specApi.renameOption(v.attributeId, v.from, v.to),
    errorFallback: "Не удалось объединить",
  });
}

export function useSaveGroups() {
  return useApiMutation({
    mutationFn: (groups: AdminSpecGroup[]) => specApi.putGroups(groups),
    success: "Группы сохранены",
    errorFallback: "Не удалось сохранить",
    invalidate: [catalogKeys.specGroups(), catalogKeys.schema()],
  });
}

/** Загрузка логотипа бренда (SVG/PNG/WebP) → ключ для logoUrl. */
export const uploadBrandLogo = brandApi.uploadLogo;
