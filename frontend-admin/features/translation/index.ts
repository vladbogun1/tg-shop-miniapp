/** Публичный вход фичи «Переводы»: экран, статистика для бейджа меню, инвалидация кэша, чистая логика и общие кусочки UI. */
export { TranslationsScreen } from "./ui/TranslationsScreen";
export { translationApi } from "./api";
export type { TrAcceptResult, TrCounts, TrImportResult, TrRejected, TrSourceFixResult, TrStats, TrTextCounts } from "./api";
export { translationKeys } from "./keys";
export { invalidateTranslations, patchTranslations, useTranslationExport, useTranslationStats } from "./queries";
export { pendingCount } from "./model/stats";
export { plural } from "./model/plural";
export * from "./model/types";
export * from "./model/workset";
export * from "./model/check";
export * from "./model/diff";
export * from "./model/parse";
export * from "./model/review";
export * from "./model/queue";
export { GLOSSARY, KIND_LABEL, KIND_SHORT, buildPrompt, splitIntoParts, type PromptString } from "./model/prompt";
export { CopyButton, Diff, InlineText, IssueList, Kbd, KindBadge, ProductLink, SourceText, StateChip, copyText } from "./ui/shared";
