/** Публичный API фичи «Карточки»: экран, окно оформления одной карточки, статистика для бейджа меню, инвалидация кэша. */
export { CardsScreen } from "./ui/screen/CardsScreen";
export { CardCompletionModal, type CardCompletionResult } from "./ui/completion/CardCompletionModal";
export { cardsKeys } from "./keys";
export { invalidateCards, pendingCards, useCardItems, useCardSchema, useCardStats } from "./queries";
export type { CardStats } from "./api";
