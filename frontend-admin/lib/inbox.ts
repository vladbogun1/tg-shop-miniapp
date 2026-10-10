/**
 * «Внимание» — everything waiting for the owner (GET /api/admin/inbox) and the snooze /
 * dismiss / restore calls. The same query feeds the page, the menu badge and the bell, so they
 * always show one number.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, isAuthenticated } from "@/lib/api";

/** Kinds the UI knows (icon, colour, main action). The server may add more — see `knownType`. */
export const INBOX_TYPES = [
  "PAYMENT",
  /** APPROVED, but the online prepayment / payment never arrived. */
  "APPROVED_UNPAID",
  "CHAT",
  "NEW_STALE",
  "APPROVED_STALE",
  "RETURN",
  "LOW_STOCK",
  "SITE_ERROR",
  "REVIEW",
  /** Support question waiting for an answer: entityId = thread id, no orderId. */
  "SUPPORT",
] as const;
export type KnownInboxType = (typeof INBOX_TYPES)[number];
/** A kind from the server: one of the known ones, or a newer one rendered with its own title. */
export type InboxType = KnownInboxType | (string & {});

export function knownType(type: InboxType): KnownInboxType | null {
  return (INBOX_TYPES as readonly string[]).includes(type) ? (type as KnownInboxType) : null;
}

/**
 * PAYMENT rows come in two flavours (the server tells them apart by the version prefix):
 * «Оплачен онлайн — подтвердите заказ» (`paid:…`) and «Оплачен, но отменён — верните деньги»
 * (`refund:…`). Falls back to the subtitle wording.
 */
export function isRefundRow(item: Pick<InboxItem, "type" | "version" | "subtitle">): boolean {
  if (item.type !== "PAYMENT") return false;
  if (item.version.startsWith("refund:")) return true;
  if (item.version.startsWith("paid:")) return false;
  return /верните деньги/i.test(item.subtitle ?? "");
}

export interface InboxItem {
  /** `TYPE:entityId` */
  key: string;
  type: InboxType;
  /** Order id, `productId` / `productId:variantId`, or `site`. */
  entityId: string;
  /** Event version — sent back with snooze/dismiss; a newer event brings the row back. */
  version: string;
  title: string;
  subtitle?: string | null;
  orderId?: string | null;
  shortId?: string | null;
  status?: string | null;
  amountMinor?: number | null;
  amountNote?: string | null;
  productId?: string | null;
  variantId?: string | null;
  stock?: number | null;
  daysToZero?: number | null;
  unread?: number | null;
  since?: string | null;
  waitMinutes: number;
  overdue: boolean;
}

export interface InboxGroup {
  id: InboxType;
  title: string;
  hint: string;
  dismissible: boolean;
  count: number;
  /** Rows of this kind hidden by «Отложить» right now. */
  snoozed: number;
  items: InboxItem[];
}

export interface Inbox {
  generatedAt: string;
  total: number;
  groups: InboxGroup[];
  newStaleHours: number;
  approvedStaleHours: number;
  returnsDays: number;
}

export type SnoozePreset = "HOUR" | "TOMORROW" | "DAYS3";

export const SNOOZE_OPTIONS: { value: SnoozePreset; label: string }[] = [
  { value: "HOUR", label: "На 1 час" },
  { value: "TOMORROW", label: "До завтра 9:00" },
  { value: "DAYS3", label: "На 3 дня" },
];

export const inboxApi = {
  get: () => apiGet<Inbox>("/api/admin/inbox"),
  snooze: (it: Pick<InboxItem, "type" | "entityId" | "version">, preset: SnoozePreset) =>
    apiPost<{ until: string }>("/api/admin/inbox/snooze", {
      type: it.type,
      entityId: it.entityId,
      version: it.version,
      preset,
    }),
  dismiss: (it: Pick<InboxItem, "type" | "entityId" | "version">) =>
    apiPost<void>("/api/admin/inbox/dismiss", { type: it.type, entityId: it.entityId, version: it.version }),
  restore: (it: Pick<InboxItem, "type" | "entityId">) =>
    apiPost<void>("/api/admin/inbox/restore", { type: it.type, entityId: it.entityId }),
};

export const INBOX_QUERY_KEY = ["admin", "inbox"] as const;

/** Polls every 30 s and on focus; other screens refetch it right after acting on an order or chat. */
export function useInbox() {
  return useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: inboxApi.get,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated(),
  });
}

export function refreshInbox(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: INBOX_QUERY_KEY });
}

/** «12 мин», «3 ч 5 мин», «2 дн 4 ч» — how long the row has been waiting. */
export function formatWait(minutes: number): string {
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  if (h < 24) {
    const m = minutes % 60;
    return m > 0 && h < 6 ? `${h} ч ${m} мин` : `${h} ч`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 && d < 3 ? `${d} дн ${rh} ч` : `${d} дн`;
}
