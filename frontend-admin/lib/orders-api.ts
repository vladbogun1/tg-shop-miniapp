/**
 * Order endpoints added in admin v2 (package B) — kept apart from lib/api.ts so parallel work on
 * that file does not collide. Same http client, same error type.
 */
import type { NpCity, NpWarehouse } from "@shop/shared";
import {
  adminApi,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type AuditEntry,
  type BoardDto,
  type DispatchOrder,
  type MessageDto,
  type OrderDetailDto,
  type OrderStatus,
  type TimeRange,
  type UserCardDto,
} from "./api";
import type { RejectReasonCode } from "./orders";

export type { NpCity, NpWarehouse };

/** Order detail + the v2 fields (reject code, returns, NP refs for the delivery editor). */
export type AdminOrderDetail = Omit<OrderDetailDto, "items"> & {
  rejectReasonCode?: RejectReasonCode | null;
  refundedMinor?: number;
  returnedAt?: string | null;
  npCityRef?: string | null;
  npWarehouseRef?: string | null;
  items: (OrderDetailDto["items"][number] & { returnedQty?: number })[];
  /** Exchanges made on this order, oldest first. */
  exchanges?: OrderExchange[];
};

/** One exchange (V51): what came back, what went out instead, ТТН and total before. */
export interface OrderExchange {
  createdAt: string;
  previousStatus: OrderStatus;
  previousTracking?: string | null;
  returnedSummary: string;
  givenSummary: string;
  totalBeforeMinor: number;
  totalAfterMinor: number;
  note?: string | null;
  adminName?: string | null;
}

/** POST …/cancel-request/approve — what happened to the money. */
export interface CancelApproveResult {
  order: AdminOrderDetail;
  /** Sent to monobank for refund (booked when the bank confirms). */
  refundRequestedMinor: number;
  refundedInvoices: number;
  /** Invoices monobank refused to refund — return those by hand. */
  refundErrors: string[];
  /** Money recorded by hand (not via monobank) — return it by hand too. */
  manualRefundMinor: number;
}

/** Board + true per-column money totals from the server. */
export type AdminBoard = BoardDto & { sums?: Record<OrderStatus, number> };

/** Dispatch row; `status` is NEW for orders that can be shipped without approving first. */
export type AdminDispatchOrder = DispatchOrder & { status?: "NEW" | "APPROVED" };

export interface StatusChangeBody {
  status: OrderStatus;
  trackingNumber?: string;
  rejectReason?: string;
  rejectReasonCode?: RejectReasonCode;
  restock?: boolean;
}

export interface DeliveryPatch {
  customerName?: string;
  phone?: string;
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
}

export interface ReturnBody {
  lines: { itemId: number; quantity: number; restock: boolean }[];
  refundMinor: number;
  note?: string;
}

export interface ExchangeBody {
  /** restock = the returned units go back into circulation (on the shelf). */
  returned: { itemId: number; quantity: number; restock: boolean }[];
  items: { productId: string; variantId?: string; quantity: number }[];
  targetStatus: "NEW" | "APPROVED";
  notifyCustomer: boolean;
  note?: string;
}

export interface ReplyTemplate {
  id: number;
  title: string;
  bodyRu: string;
  bodyUk?: string | null;
  bodyEn?: string | null;
  sort: number;
  /** The uk/en text was made for an older Russian one (not used in the chat until redone). */
  ukStale?: boolean;
  enStale?: boolean;
}

export interface ReplyTemplateWrite {
  title: string;
  bodyRu: string;
  bodyUk?: string;
  bodyEn?: string;
  sort?: number;
}

/** A template filled in for one order, in the customer's language. */
export interface RenderedTemplate {
  id: number;
  title: string;
  text: string;
  locale: "uk" | "ru" | "en";
}

/** Page size of the order chat (the backend default). */
export const CHAT_PAGE = 50;

export const ordersApi = {
  board: (params: { q?: string; range?: TimeRange; closedLimit?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.range) sp.set("range", params.range);
    if (params.closedLimit) sp.set("closedLimit", String(params.closedLimit));
    const qs = sp.toString();
    return apiGet<AdminBoard>(`/api/admin/orders/board${qs ? `?${qs}` : ""}`);
  },

  order: (id: string) => adminApi.order(id) as Promise<AdminOrderDetail>,

  changeStatus: (id: string, body: StatusChangeBody) =>
    apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/status`, body),

  /** PATCH /api/admin/orders/{id}/tracking — fix the ТТН after shipping (customer is told). */
  updateTracking: (id: string, trackingNumber: string) =>
    apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/tracking`, { trackingNumber }),

  /** PATCH /api/admin/orders/{id}/delivery — recipient / phone / NP city + branch. */
  updateDelivery: (id: string, patch: DeliveryPatch) =>
    apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/delivery`, patch),

  /** POST /api/admin/orders/{id}/return — (partial) return + refund. */
  registerReturn: (id: string, body: ReturnBody) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/return`, body),

  /** POST /api/admin/orders/{id}/exchange — swap goods in a paid order, back to NEW for a new ТТН. */
  exchange: (id: string, body: ExchangeBody) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/exchange`, body),

  /** Customer's cancellation request: cancel (CHANGED_MIND) + restock + full monobank refund. */
  approveCancelRequest: (id: string, comment?: string) =>
    apiPost<CancelApproveResult>(`/api/admin/orders/${id}/cancel-request/approve`, { comment }),

  /** Decline the customer's cancellation request; the comment (required) goes to the customer. */
  declineCancelRequest: (id: string, comment: string) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/cancel-request/decline`, { comment }),

  dispatch: (includeNew = true) =>
    apiGet<AdminDispatchOrder[]>(`/api/admin/orders/dispatch${includeNew ? "?includeNew=true" : ""}`),

  /** Chat page: newest `limit` messages before `before` (oldest first). */
  messages: (id: string, before?: number, limit = CHAT_PAGE) => {
    const sp = new URLSearchParams();
    if (before) sp.set("before", String(before));
    sp.set("limit", String(limit));
    return apiGet<MessageDto[]>(`/api/admin/orders/${id}/messages?${sp.toString()}`);
  },

  /**
   * History of one order from the admin action log. The `entityType`/`entityId` filters are added
   * to GET /api/admin/audit by package D; until they exist the server ignores them and returns the
   * latest entries, so the result is filtered here as well.
   */
  orderAudit: async (id: string) => {
    const rows = await apiGet<AuditEntry[]>(
      `/api/admin/audit?entityType=ORDER&entityId=${encodeURIComponent(id)}&size=200`
    );
    return rows.filter((r) => r.entityType === "ORDER" && r.entityId === id);
  },

  /** The customer's profile card, for opening it over the order. */
  findUser: async (telegramUserId: number): Promise<UserCardDto | null> => {
    const rows = await adminApi.users({ q: String(telegramUserId), size: 10 });
    return rows.find((u) => u.telegramUserId === telegramUserId) ?? null;
  },

  npCities: (q: string) => apiGet<NpCity[]>(`/api/np/cities?q=${encodeURIComponent(q)}`),
  npWarehouses: (cityRef: string, q: string) =>
    apiGet<NpWarehouse[]>(
      `/api/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q)}`
    ),

  // ---- reply templates (N5) ----
  replyTemplates: () => apiGet<ReplyTemplate[]>("/api/admin/reply-templates"),
  createReplyTemplate: (body: ReplyTemplateWrite) =>
    apiPost<ReplyTemplate>("/api/admin/reply-templates", body),
  updateReplyTemplate: (id: number, body: ReplyTemplateWrite) =>
    apiPut<ReplyTemplate>(`/api/admin/reply-templates/${id}`, body),
  deleteReplyTemplate: (id: number) => apiDelete<void>(`/api/admin/reply-templates/${id}`),
  renderedTemplates: (orderId: string) =>
    apiGet<RenderedTemplate[]>(`/api/admin/orders/${orderId}/reply-templates`),
};
