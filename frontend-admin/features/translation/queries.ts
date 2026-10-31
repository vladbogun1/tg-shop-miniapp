"use client";

/**
 * Запросы и записи «Переводов». Статистика — общий запрос: бейдж меню (уникальные тексты, которым нужен
 * перевод) читает её же, а экран считает те же корзины из экспорта.
 */
import { QUERY_PRESETS } from "@shop/core/query";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { isAuthenticated } from "@/lib/api";
import { acceptAll, acceptText, resetText, sendAiTranslations, type AcceptOutcome } from "./actions";
import { translationApi } from "./api";
import { translationKeys } from "./keys";
import { summaryApplied, summaryFixed, type AiSendPlan, type SendSummary } from "./model/send";
import type { TrExportData, TrExportItem, TrLocale, TrOrigin } from "./model/types";
import type { UniqueString } from "./model/workset";

export function useTranslationStats() {
  return useQuery({
    queryKey: translationKeys.stats(),
    queryFn: translationApi.stats,
    // 2 минуты, как было.
    refetchInterval: QUERY_PRESETS.live.refetchInterval * 4,
    refetchOnWindowFocus: true,
    retry: false,
    enabled: isAuthenticated(),
  });
}

/** After any write: refresh the badge, the counters and the lists. */
export function invalidateTranslations(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: translationKeys.stats() });
  qc.invalidateQueries({ queryKey: translationKeys.export() });
}

/** Raw export of both languages — the page builds the work set from it (`buildWorkSet`). */
export function useTranslationExport() {
  return useQuery({
    queryKey: translationKeys.export(),
    queryFn: async (): Promise<TrExportData> => {
      const [uk, en] = await Promise.all([translationApi.export("uk"), translationApi.export("en")]);
      return { uk, en };
    },
    staleTime: QUERY_PRESETS.list.staleTime,
  });
}

export interface TrPatch {
  entityType: string;
  entityId: string;
  field: string;
  locale: TrLocale;
  text: string;
  origin: TrOrigin;
}

/**
 * After a successful «Принять» of one text: the fields are current and checked now. Patching the
 * cached export keeps the review going without re-downloading every text after each keystroke;
 * the stats (nav badge) are refetched, the export is marked stale for the next visit.
 */
export function patchTranslations(qc: QueryClient, patches: TrPatch[]): void {
  if (patches.length) {
    const byKey = new Map(patches.map((p) => [`${p.locale}|${p.entityType}:${p.entityId}:${p.field}`, p]));
    qc.setQueryData<TrExportData>(translationKeys.export(), (old) => {
      if (!old) return old;
      const apply = (locale: TrLocale, items: TrExportItem[]) =>
        items.map((it) => {
          const p = byKey.get(`${locale}|${it.entityType}:${it.entityId}:${it.field}`);
          return p
            ? { ...it, status: "TRANSLATED" as const, text: p.text, origin: p.origin, reviewed: true, prevSource: null }
            : it;
        });
      return { uk: apply("uk", old.uk), en: apply("en", old.en) };
    });
  }
  qc.invalidateQueries({ queryKey: translationKeys.stats() });
  qc.invalidateQueries({ queryKey: translationKeys.export(), refetchType: "none" });
}

// ---- записи ------------------------------------------------------------------

export interface AcceptTextVars {
  s: UniqueString;
  langs: TrLocale[];
  texts: Partial<Record<TrLocale, string>>;
  /** Языки, где админ поправил текст сам (сохраняются как MANUAL). */
  own: Partial<Record<TrLocale, boolean>>;
}

/**
 * «Принять» одного текста. Если оригинал изменился или поле пропало — список обновляется, тост об ошибке,
 * `onAccepted` не вызывается (человек остаётся на тексте); иначе кэш правится на месте и вызывается `onAccepted`.
 */
export function useAcceptText(onAccepted: () => void) {
  const qc = useQueryClient();
  return useApiMutation<AcceptOutcome, AcceptTextVars>({
    mutationFn: (v) => acceptText(v.s, v.texts, v.own),
    errorFallback: "Не удалось сохранить",
    success: (r, v) => (r.outdated || r.failed ? undefined : v.langs.some((l) => v.own[l]) ? "Перевод сохранён" : "Принято"),
    onSuccess: (r, v) => {
      if (r.outdated || r.failed) {
        invalidateTranslations(qc);
        toast.error(
          r.outdated
            ? "Оригинал изменили, пока вы смотрели. Список обновлён — проверьте текст ещё раз."
            : `Не сохранено мест: ${r.failed}. Обновите страницу.`
        );
        return;
      }
      patchTranslations(
        qc,
        v.langs.flatMap((l) =>
          v.s.fields.map((f) => ({
            entityType: f.entityType,
            entityId: f.entityId,
            field: f.field,
            locale: l,
            text: v.texts[l]!,
            origin: v.own[l] ? ("MANUAL" as const) : (f.origin[l] ?? "AI"),
          }))
        )
      );
      onAccepted();
    },
  });
}

/** «Удалить перевод» одного языка во всех полях с этим текстом. */
export function useResetText(onDone: (l: TrLocale) => void) {
  return useApiMutation<number, { s: UniqueString; l: TrLocale }>({
    mutationFn: (v) => resetText(v.s, v.l),
    invalidate: [translationKeys.stats(), translationKeys.export()],
    success: "Перевод удалён",
    errorFallback: "Не удалось удалить",
    onSuccess: (_n, v) => onDone(v.l),
  });
}

/** «Принять все» без просмотра. Кэш обновляется и после сбоя (часть пачек могла пройти). */
export function useAcceptAll() {
  const qc = useQueryClient();
  return useApiMutation<AcceptOutcome, { strings: UniqueString[]; langs: TrLocale[] }>({
    mutationFn: (v) => acceptAll(v.strings, v.langs),
    invalidate: [translationKeys.stats(), translationKeys.export()],
    errorFallback: "Не удалось принять",
    onSuccess: (r) => {
      (r.outdated || r.failed ? toast.info : toast.success)(
        r.outdated || r.failed
          ? `Принято ${r.done}; ${[
              r.outdated ? `оригинал изменился у ${r.outdated}` : "",
              // notFound + invalid: the product/field is gone or the text is broken — not a changed original.
              r.failed ? `не удалось сохранить ${r.failed}` : "",
            ]
              .filter(Boolean)
              .join(", ")} — они остались в списке`
          : `Принято: ${r.done}`
      );
    },
    onError: () => invalidateTranslations(qc),
  });
}

/**
 * «Сохранить отмеченные» из «Перевода через ИИ»: импорт по языкам и правки оригиналов. Сбои отдельных запросов
 * не бросаются, а попадают в итог (`SendSummary`) — человек видит, что прошло, а что нет.
 */
export function useSendAiTranslations(onDone: (summary: SendSummary) => void) {
  return useApiMutation<SendSummary, AiSendPlan>({
    mutationFn: sendAiTranslations,
    invalidate: [translationKeys.stats(), translationKeys.export(), ...translationKeys.catalogRoots()],
    onSuccess: (summary) => {
      onDone(summary);
      if (summary.importErrors.length) {
        toast.error("Часть данных не отправлена — см. итог");
        return;
      }
      const fixed = summaryFixed(summary);
      toast.success(
        `Сохранено переводов: ${summaryApplied(summary)}${fixed ? `, исправлено оригиналов: ${fixed}` : ""}. Они ждут проверки во вкладке «Проверить ИИ».`
      );
    },
  });
}
