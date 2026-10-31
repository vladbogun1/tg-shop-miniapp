"use client";

import type { CaseRarity, CaseTier } from "@shop/core/giftcase";
import { useApiMutation } from "@shop/ui/mutation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsApi, settingsKeys, type SettingValue } from "@/features/settings";
import { giftApi } from "./api";
import { giftKeys } from "./keys";
import { CASE_TIER_LABEL } from "./model/labels";
import type {
  AutofillRequest,
  AutofillResult,
  CaseDraftItem,
  CaseItemAdmin,
  GiftTierAdmin,
  GiftTierPatch,
  LowMargin,
  LowMarginBody,
} from "./model/types";

/** 60 с — как у этих запросов до выноса в фичу (статистика, список товаров, настройки мастера). */
export const GIFT_STALE_MS = 60_000;

// ---- чтение ----------------------------------------------------------------

export function useGiftStatsQuery() {
  return useQuery({ queryKey: giftKeys.stats(), queryFn: giftApi.stats, staleTime: GIFT_STALE_MS });
}

export function useGiftTiersQuery() {
  return useQuery({ queryKey: giftKeys.tiers(), queryFn: giftApi.tiers });
}

export function useCaseItemsQuery() {
  return useQuery({ queryKey: giftKeys.caseItems(), queryFn: giftApi.caseItems });
}

/** Реестр за период; без запроса, пока даты неверны. */
export function useGiftRegistryQuery(from: string, to: string, enabled: boolean) {
  return useQuery({ queryKey: giftKeys.registry(from, to), queryFn: () => giftApi.registry(from, to), enabled });
}

export function useLowMarginQuery() {
  return useQuery({ queryKey: giftKeys.lowMargin(), queryFn: giftApi.lowMargin });
}

/** Товары той же редкости на замену приза; `exclude` — уже лежащие в кейсе. */
export function useAlternativesQuery(tier: CaseTier, rarity: CaseRarity | undefined, exclude: string[], enabled: boolean) {
  return useQuery({
    queryKey: giftKeys.alternatives(tier, rarity, exclude),
    queryFn: () => giftApi.alternatives(tier, rarity!, exclude),
    enabled,
    staleTime: GIFT_STALE_MS,
  });
}

/** Настройки страницы подарка (те же, что у «Настроек»): форма висит на этом ключе. */
export function useGiftSettingsQuery() {
  return useQuery({ queryKey: settingsKeys.all(), queryFn: settingsApi.list });
}

/** Своя копия настроек для «Автособрать»: на ключе страницы висит форма, её черновик не должен сбрасываться. */
export function useAutofillSettingsQuery(enabled: boolean) {
  return useQuery({ queryKey: giftKeys.autofillSettings(), queryFn: settingsApi.list, enabled, staleTime: GIFT_STALE_MS });
}

// ---- запись ----------------------------------------------------------------

/** Сохранение настроек подарка одним запросом; ответ сервера заменяет кэш, кейсы и статистика перечитываются. */
export function useSaveGiftSettings() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (values: Record<string, SettingValue | null>) => settingsApi.save(values),
    invalidate: [giftKeys.all()],
    success: (_r, values) => {
      const n = Object.keys(values).length;
      return n === 1 ? "Настройка сохранена" : `Сохранено настроек: ${n}`;
    },
    errorFallback: "Не удалось сохранить",
    onSuccess: (fresh) => {
      qc.setQueryData(settingsKeys.all(), fresh);
    },
  });
}

/** Порог, скидка, промокод или вкл/выкл одного кейса: сохраняется сразу, ответ подставляется в список. */
export function usePatchTier(tier: CaseTier) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (v: { body: GiftTierPatch; okText: string }) => giftApi.patchTier(tier, v.body),
    success: (_r, v) => v.okText,
    errorFallback: "Не удалось сохранить кейс",
    onSuccess: (fresh) => {
      qc.setQueryData<GiftTierAdmin[]>(giftKeys.tiers(), (old) => (old ?? []).map((t) => (t.tier === fresh.tier ? fresh : t)));
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: giftKeys.tiers() });
    },
  });
}

/** «Опубликовать»: призы кейса становятся ровно такими; `onPublished` — сбросить черновик. */
export function usePublishCase(tier: CaseTier, onPublished: () => void) {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (items: CaseDraftItem[]) => giftApi.replaceItems(tier, items),
    invalidate: [giftKeys.tiers(), giftKeys.stats()],
    success: `${CASE_TIER_LABEL[tier]} кейс опубликован`,
    errorFallback: "Не удалось опубликовать",
    onSuccess: (fresh) => {
      qc.setQueryData<CaseItemAdmin[]>(giftKeys.caseItems(), fresh);
      onPublished();
    },
  });
}

/** «Автособрать»: сервер подбирает призы, результат уходит в черновик (`onResult`). */
export function useAutofill(tier: CaseTier, onResult: (res: AutofillResult) => void) {
  return useApiMutation({
    mutationFn: (body: AutofillRequest) => giftApi.autofill(tier, body),
    errorFallback: "Не удалось собрать кейс",
    onSuccess: onResult,
  });
}

/** Выбранные категории «Автособрать» запоминаются как умолчания; сбой молча игнорируется. */
export function useRememberAutofillCategories() {
  return useApiMutation({
    mutationFn: (values: Record<string, SettingValue>) => settingsApi.save(values),
    invalidate: [giftKeys.autofillSettings()],
    toastOnError: false,
  });
}

/** Один пробный розыгрыш (или серия) на сервере: ничего не сохраняется. */
export function useTestDraw(tier: CaseTier) {
  return useApiMutation({
    mutationFn: (v: { count: number; draft?: CaseDraftItem[]; lowMargin: boolean }) =>
      giftApi.testDraw(tier, v.count, v.draft, v.lowMargin),
    errorFallback: "Не удалось открыть кейс",
  });
}

/** «Упор на скидки»: каждое изменение сохраняется сразу, ответ подставляется в кэш. */
export function useSetLowMargin() {
  const qc = useQueryClient();
  return useApiMutation({
    mutationFn: (v: { body: LowMarginBody; okText: string }) => giftApi.setLowMargin(v.body),
    success: (_r, v) => v.okText,
    errorFallback: "Не удалось сохранить",
    onSuccess: (fresh) => {
      qc.setQueryData<LowMargin>(giftKeys.lowMargin(), fresh);
    },
  });
}
