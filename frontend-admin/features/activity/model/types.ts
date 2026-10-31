import type { BroadcastHistoryItem } from "@/features/notification";

export type ActivitySource = "BOT" | "SITE" | "MINIAPP" | "PAYMENT" | "SYSTEM";
export type ActivityResult = "OK" | "FAILED" | "SKIPPED";

export interface ActivityRow {
  id: number;
  createdAt: string;
  source: ActivitySource | string;
  type: string;
  result: ActivityResult | string;
  /** CUSTOMER | ADMINS — whom the bot wrote to; null for non-messages. */
  recipient?: string | null;
  tgUserId?: number | null;
  customerName?: string | null;
  customerUsername?: string | null;
  chatId?: number | null;
  orderId?: string | null;
  groupId?: string | null;
  summary?: string | null;
  errorCode?: string | null;
  error?: string | null;
  /** JSON object as text. */
  details?: string | null;
}

export interface ActivityPage {
  items: ActivityRow[];
  /** By result for the whole filter; only on page 0. */
  totals?: Record<string, number> | null;
}

export interface ActivityFilter {
  source?: string;
  type?: string;
  result?: string;
  recipient?: string;
  tgUserId?: number;
  order?: string;
  group?: string;
  errorCode?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface ActivityFacets {
  types: { source: string; type: string }[];
  errorCodes: string[];
  retentionDays: number;
}

export type ActivityStats = Record<string, { total?: number; ok?: number; failed?: number; skipped?: number }>;

export interface BroadcastSummary {
  broadcast: BroadcastHistoryItem;
  group: string;
  delivered: number;
  failed: number;
  skipped: number;
  reasons: Record<string, number>;
}
