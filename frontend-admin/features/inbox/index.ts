/**
 * Публичный вход фичи «Внимание»: экран, общий запрос (бейджи меню, колокольчик) и ключ для инвалидации
 * из других фич (поддержка, отзывы, отправка).
 */
export { InboxScreen } from "./ui/InboxScreen";
export type { InboxOrderSlot } from "./model/order-slot";
export { inboxKeys } from "./keys";
export { refreshInbox, useInbox } from "./queries";
