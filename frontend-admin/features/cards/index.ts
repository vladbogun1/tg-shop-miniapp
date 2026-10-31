/** Публичный API фичи «Карточки»: окно оформления одной карточки, статистика для бейджа меню, инвалидация кэша. */
export { CardCompletionModal, type CardCompletionResult } from "./ui/CardCompletionModal";
export { CARDS_EXPORT_KEY, CARDS_STATS_KEY, invalidateCards, pendingCards, useCardItems, useCardStats } from "./queries";
