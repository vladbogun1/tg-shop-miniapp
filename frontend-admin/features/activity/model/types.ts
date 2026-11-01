import type { Schemas } from "@shop/core/api/schemas";

export type ActivityRow = Schemas["JournalActivityFeedRow"];
export type ActivitySource = ActivityRow["source"];
export type ActivityResult = ActivityRow["result"];
export type ActivityPage = Schemas["Page"];
export type ActivityFacets = Schemas["Facets"];
/** Per source: counters of the last hours (total / failed / skipped / ok). */
export type ActivityStats = Record<string, Record<string, number>>;

/** The feed's query string as the filter bar builds it: UI state, not a response (paging is added by the api). */
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

export type BroadcastSummary = Schemas["NotificationBroadcastDeliveryReportSummary"];
