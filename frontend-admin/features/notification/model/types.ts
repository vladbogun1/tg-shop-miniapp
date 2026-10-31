import type { Schemas } from "@shop/core/api/schemas";
import type { ShopLang } from "@/lib/shop-lang";

export type { ShopLang };

export type BroadcastAudience = "all" | "active" | "inactive" | "premium";

/**
 * Строка истории рассылок: бэкенд шлёт audience/status/lang строками, а пустые поля — null;
 * экран работает с закрытыми множествами значений.
 */
export type BroadcastHistoryItem = Omit<
  Schemas["BroadcastHistoryDto"],
  "audience" | "lang" | "status" | "adminName" | "textUk" | "textRu" | "textEn" | "finishedAt"
> & {
  audience: BroadcastAudience;
  lang?: ShopLang | null;
  status: "RUNNING" | "DONE" | "INTERRUPTED";
  adminName?: string | null;
  textUk?: string | null;
  textRu?: string | null;
  textEn?: string | null;
  finishedAt?: string | null;
};

export interface BroadcastStartBody {
  text: string;
  audience: BroadcastAudience;
  withButton: boolean;
  buttonText?: string;
  lang?: ShopLang | "";
  textUk?: string;
  textRu?: string;
  textEn?: string;
}

export interface BroadcastTestBody {
  text: string;
  telegramUserId?: number;
  withButton: boolean;
  buttonText?: string;
}
