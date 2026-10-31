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
