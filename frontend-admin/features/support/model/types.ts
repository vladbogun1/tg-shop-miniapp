/**
 * Строки поддержки общие с клиентскими приложениями (`@shop/core/support`), а сгенерированная схема
 * считает все поля обязательными, хотя сервер присылает null, — поэтому типы берём из core.
 */
export type { SupportMessage, SupportThread } from "@shop/core/support";

export type SupportFilter = "open" | "awaiting" | "closed" | "all";

export interface SupportThreadsQuery {
  filter?: SupportFilter;
  q?: string;
  limit?: number;
}

/** «Написать первым»: `userId` — Telegram id покупателя. */
export interface StartThreadBody {
  userId: number;
  subject?: string;
  text: string;
}
