/** Публичный API фичи «Карточки»: окно оформления одной карточки, статистика для бейджа меню, инвалидация кэша. */
export { CardCompletionModal, type CardCompletionResult } from "./ui/completion/CardCompletionModal";
export { cardsKeys } from "./keys";
export { invalidateCards, pendingCards, useCardItems, useCardSchema, useCardStats } from "./queries";
export type { CardStats } from "./api";
