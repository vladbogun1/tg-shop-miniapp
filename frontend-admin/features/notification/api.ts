import type { Schemas } from "@shop/core/api/schemas";
import { customerApi, type UserCardDto } from "@/features/customer";
import { apiGet, apiPost } from "@/lib/api";
import type { BroadcastAudience, BroadcastHistoryItem, BroadcastStartBody, BroadcastTestBody, ShopLang } from "./model/types";

export type BroadcastStatus = Schemas["BroadcastStatus"];
export type BroadcastResult = Schemas["BroadcastResult"];
export type PushConfig = Schemas["PushConfig"];
export type PushTestResult = Schemas["SendResult"];

function langQuery(lang: ShopLang | ""): string {
  return lang ? `?lang=${encodeURIComponent(lang)}` : "";
}

export const broadcastApi = {
  audiences: (lang: ShopLang | "") => apiGet<Record<BroadcastAudience, number>>(`/api/admin/broadcast/audiences${langQuery(lang)}`),
  status: () => apiGet<BroadcastStatus>("/api/admin/broadcast/status"),
  history: (limit: number) => apiGet<BroadcastHistoryItem[]>(`/api/admin/broadcast/history?limit=${limit}`),
  start: (body: BroadcastStartBody) => apiPost<BroadcastStatus>("/api/admin/broadcast", body),
  /** `telegramUserId` не задан — тому админу, кто отправляет («себе»). */
  test: (body: BroadcastTestBody) => apiPost<BroadcastResult>("/api/admin/broadcast/test", body),
  /** Поиск получателя теста (поиск покупателей — как в «Покупателях»). */
  searchUsers: (q: string): Promise<UserCardDto[]> => customerApi.users({ q, size: 8 }),
};

/** Web Push этого устройства: /api/admin/push/*. */
export const pushApi = {
  config: () => apiGet<PushConfig>("/api/admin/push/config"),
  subscribe: (sub: PushSubscriptionJSON) => apiPost<void>("/api/admin/push/subscribe", sub),
  unsubscribe: (endpoint: string) => apiPost<void>("/api/admin/push/unsubscribe", { endpoint }),
  test: (endpoint: string | null) => apiPost<PushTestResult>("/api/admin/push/test", { endpoint }),
};
