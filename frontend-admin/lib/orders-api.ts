/**
 * Order endpoints added in admin v2 (package B) — kept apart from lib/api.ts so parallel work on
 * that file does not collide. Same http client, same error type.
 */
import type { CaseTier, NpCity, NpWarehouse } from "@shop/shared";
import type { ConfirmOptions } from "@/components/ui/ConfirmModal";
import {
  adminApi,
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type AuditEntry,
  type DispatchOrder,
  type MessageDto,
  type OrderCardDto,
  type OrderDetailDto,
  type OrderStatus,
  type TimeRange,
  type UserCardDto,
} from "./api";
import type { BoardKey, MovementChannel, MovementKind, RejectReasonCode } from "./orders";

export type { NpCity, NpWarehouse };

/** Order detail + the v2 fields (reject code, returns, NP refs for the delivery editor). */
export type AdminOrderDetail = Omit<OrderDetailDto, "items"> & {
  rejectReasonCode?: RejectReasonCode | null;
  refundedMinor?: number;
  returnedAt?: string | null;
  npCityRef?: string | null;
  npWarehouseRef?: string | null;
  items: (OrderDetailDto["items"][number] & {
    returnedQty?: number;
    /** Price of one unit after the proportional discount (0 for gifts) — V68. */
    unitPaidMinor?: number;
    /** Units on their way back to the shop (V68). */
    returnPendingQty?: number;
  })[];
  /** Exchanges made on this order, oldest first. */
  exchanges?: OrderExchange[];
  /** Archive, money journal, write-offs, the parcel on its way back (V68). */
  admin?: OrderAdminExtras | null;
};

/** One row of the order's money journal. */
export interface OrderMovement {
  id: number;
  kind: MovementKind;
  channel: MovementChannel;
  amountMinor: number;
  occurredAt: string;
  adminName?: string | null;
  note?: string | null;
  invoiceExtId?: string | null;
  /** BACKFILL = restored on 25.10 from the old data. */
  source: "AUTO" | "ADMIN" | "BACKFILL";
}

export interface OrderWriteoff {
  id: number;
  title: string;
  quantity: number;
  /** Of them: back on the shelf or back in the order (V70). */
  undoneQty?: number;
  undoneNote?: string | null;
  reason: string;
  unitValueMinor: number;
  note?: string | null;
  adminName?: string | null;
  createdAt: string;
}

export type ReturnStatus = "IN_TRANSIT" | "RECEIVED";

export interface OrderAdminExtras {
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  returnStatus?: ReturnStatus | null;
  returnReceivedAt?: string | null;
  movements: OrderMovement[];
  retainedMinor: number;
  /** What can still go back to the card through monobank. */
  monoRefundableMinor: number;
  writeoffs: OrderWriteoff[];
  /** This order is the replacement of an exchange on that order (V69). */
  exchangeOfId?: string | null;
  /** Replacement orders of exchanges made on this one, oldest first. */
  exchangeOrderIds?: string[];
  /** Returns and exchanges of this order (V70), oldest first. */
  returns?: ReturnRecord[];
  /** This order was merged into that one (V71). */
  mergedIntoId?: string | null;
  /** Orders merged into this one, oldest first. */
  mergedFromIds?: string[];
}

/** Another open order of the same customer for «Объединить» (V71) and the merged result. */
export interface MergeCandidate {
  id: string;
  status: "NEW" | "APPROVED";
  createdAt: string;
  totalMinor: number;
  receivedMinor: number;
  prepaymentMinor: number;
  paid: boolean;
  paymentOptionTitle?: string | null;
  npCityName?: string | null;
  npWarehouseName?: string | null;
  customerName?: string | null;
  trackingNumber?: string | null;
  giftCaseStatus?: string | null;
  lines: string[];
  /** Why it cannot be merged now; null = it can. */
  blocker?: string | null;
}

export interface MergeBody {
  sourceId: string;
  useSourceDelivery: boolean;
  notifyCustomer: boolean;
  note?: string;
}

export type ReturnLineOutcome = "RESTOCK" | "DEFECT" | "KEPT" | "IN_TRANSIT";

export interface ReturnRecordLine {
  itemId: number;
  title: string;
  imageUrl?: string | null;
  quantity: number;
  outcome: ReturnLineOutcome;
  restockedQty: number;
  defectQty: number;
  /** Still on the way back. */
  pendingQty: number;
}

/** One return / exchange; only the newest active one is `cancellable`. */
export interface ReturnRecord {
  id: number;
  kind: "RETURN" | "EXCHANGE";
  createdAt: string;
  adminName?: string | null;
  note?: string | null;
  lines: ReturnRecordLine[];
  refundMinor: number;
  refundChannel?: string | null;
  monoRefundMinor: number;
  /** Replacement order of an exchange. */
  newOrderId?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelNote?: string | null;
  /** Money the customer still owes after a cancel. */
  debtMinor: number;
  debtPaidAt?: string | null;
  cancellable: boolean;
  /** Why the newest one can't be cancelled now. */
  cancelBlocker?: string | null;
}

/** What happens to the refunded money when a return is cancelled. */
export type CancelMoney = "RETURNED" | "DEBT" | "KEEP";

/** Board / table card with the V68 fields. */
export type AdminOrderCard = OrderCardDto & {
  archived?: boolean;
  returnStatus?: ReturnStatus | null;
  /** Units on their way back right now (V68). */
  returningUnits?: number;
  /** Units already given back (received / restocked / written off). */
  returnedUnits?: number;
  /** What is in the order — the picture strip of the card. */
  lines?: CardLine[];
  /** Replacement of an exchange on that order (V69). */
  exchangeOfId?: string | null;
  /** Replacements created by exchanges on this order. */
  exchangeOrderIds?: string[];
};

/** One line of a card's picture strip; `returning` = its units on the way back. */
export interface CardLine {
  imageUrl?: string | null;
  title: string;
  quantity: number;
  returning: number;
  /** Units of this line already given back. */
  returned?: number;
  gift: boolean;
}

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
  /** The replacement order (V69); null for exchanges made before it. */
  newOrderId?: string | null;
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
export type AdminBoard = {
  /** Cards per column: the five statuses + RETURNING («Едет назад», V68). */
  columns: Record<BoardKey, AdminOrderCard[]>;
  counts: Record<BoardKey, number>;
  sums?: Record<OrderStatus, number>;
};

/** Dispatch row; `status` is NEW for orders that can be shipped without approving first. */
export type AdminDispatchOrder = DispatchOrder & { status?: "NEW" | "APPROVED" };

export interface StatusChangeBody {
  status: OrderStatus;
  trackingNumber?: string;
  rejectReason?: string;
  rejectReasonCode?: RejectReasonCode;
  restock?: boolean;
  /** REJECTED of a SHIPPED order: the parcel is coming back, stock returns with «Посылка вернулась». */
  returnInTransit?: boolean;
  /** SHIPPED although the online payment has not arrived — the admin confirmed (see changeStatusConfirmingUnpaid). */
  shipUnpaid?: boolean;
}

/** Backend code: SHIPPED refused because the online payment of the order has not arrived. */
export const SHIP_UNPAID_CODE = "ORDER_UNPAID_SHIP";

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

/**
 * PATCH the status; when the server refuses SHIPPED because the prepayment / online payment has not
 * arrived (ORDER_UNPAID_SHIP), asks the admin and repeats with `shipUnpaid` — the server then logs
 * «отправлен без онлайн-оплаты по решению админа» in the order history. null = the admin declined.
 */
export async function changeStatusConfirmingUnpaid(
  id: string,
  body: StatusChangeBody,
  confirm: Confirm
): Promise<AdminOrderDetail | null> {
  try {
    return await ordersApi.changeStatus(id, body);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== SHIP_UNPAID_CODE) throw e;
    // «Предоплата по заказу #… не пришла (не хватает …).» — the first sentence of the server text.
    const head = e.message.match(/^.*?\)\./)?.[0] ?? e.message;
    const ok = await confirm({
      title: "Отправить без предоплаты?",
      message: `${head} Отправить всё равно? (например, договорились в чате) В истории заказа запишется, что он отправлен без предоплаты по вашему решению.`,
      confirmLabel: "Отправить всё равно",
      danger: true,
    });
    if (!ok) return null;
    return ordersApi.changeStatus(id, { ...body, shipUnpaid: true });
  }
}

export interface DeliveryPatch {
  customerName?: string;
  phone?: string;
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
}

/** Where a returned unit goes: shelf, write-off, or stays with the customer (compensation). */
export type ReturnOutcome = "RESTOCK" | "DEFECT" | "KEPT" | "IN_TRANSIT";
export type ExchangeOutcome = Exclude<ReturnOutcome, "KEPT">;

/** POST …/returns — the return wizard. */
export interface ReturnWizardBody {
  lines: { itemId: number; quantity: number; outcome: ReturnOutcome }[];
  /** Manual refunds; monobank is NOT a channel here — it is monoRefundMinor. */
  refunds: { channel: MovementChannel; amountMinor: number; note?: string }[];
  monoRefundMinor: number;
  retainMinor: number;
  note?: string;
  notifyCustomer: boolean;
}

/** POST …/return-received — the refused parcel is back (everything but DEFECT goes on the shelf). */
export interface ReturnReceivedBody {
  lines: { itemId: number; quantity: number; outcome: "RESTOCK" | "DEFECT" }[];
  note?: string;
}

/** Backend code: the bank refused the refund after the return itself was saved. */
export const MONO_REFUND_FAILED_CODE = "MONO_REFUND_FAILED";

export interface SetPaidBody {
  receivedMinor: number;
  channel?: MovementChannel;
  note?: string;
}

export interface ExchangeBody {
  /** IN_TRANSIT = sent back by post («Едет назад»); RESTOCK / DEFECT = already at the shop. */
  returned: { itemId: number; quantity: number; outcome: ExchangeOutcome }[];
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

export interface AdminCreateOrderBody {
  items: { productId: string; variantId: string | null; quantity: number }[];
  customerName: string;
  phone: string;
  comment?: string;
  promoCode?: string;
  deliveryMethod: "NOVA_POSHTA" | "PICKUP";
  npCityName?: string;
  npWarehouseName?: string;
  paymentOptionId: string;
  tgUserId?: number;
  /** Kopecks already received; 0 = not paid yet. */
  paidMinor: number;
  paidChannel: MovementChannel;
  note?: string;
}

export const ordersApi = {
  /** POST /api/admin/orders — a manual order (phone, Instagram, in person). */
  create: (body: AdminCreateOrderBody) => apiPost<AdminOrderDetail>("/api/admin/orders", body),
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

  /** POST /api/admin/orders/{id}/returns — the return wizard (goods + money + retained amount). */
  registerReturn: (id: string, body: ReturnWizardBody) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/returns`, body),

  /** POST /api/admin/orders/{id}/return-received — the parcel that went back has arrived. */
  receiveReturn: (id: string, body: ReturnReceivedBody) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/return-received`, body),

  /** POST …/returns/{rid}/cancel — the customer changed their mind: units back into the order. */
  cancelReturn: (id: string, returnId: number, body: { money?: CancelMoney; note: string }) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/returns/${returnId}/cancel`, body),

  /** GET …/merge-candidates — other open orders of the same customer (V71). */
  mergeCandidates: (id: string) => apiGet<MergeCandidate[]>(`/api/admin/orders/${id}/merge-candidates`),

  /** POST …/merge — merge `sourceId` into this order; returns this order. */
  merge: (id: string, body: MergeBody) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/merge`, body),

  /** POST …/returns/{rid}/debt-paid — the money of a cancelled return came back. */
  returnDebtPaid: (id: string, returnId: number) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/returns/${returnId}/debt-paid`, {}),

  /** PATCH /api/admin/orders/{id}/paid — received amount + how it came (money journal). */
  setPaid: (id: string, body: SetPaidBody) =>
    apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/paid`, body),

  /** POST …/archive — main admin only; orders are never deleted. */
  archive: (id: string, reason: string) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/archive`, { reason }),

  /** POST …/unarchive — main admin only. */
  unarchive: (id: string) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/unarchive`),

  /** GET /api/admin/orders (plain array); `archived` = only the archived ones (default: none of them). */
  list: (params: {
    status?: string;
    q?: string;
    range?: TimeRange;
    page?: number;
    size?: number;
    sortBy?: string;
    sortDir?: string;
    archived?: boolean;
  }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.q) sp.set("q", params.q);
    if (params.range) sp.set("range", params.range);
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 20));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    if (params.archived) sp.set("archived", "true");
    return apiGet<AdminOrderCard[]>(`/api/admin/orders?${sp.toString()}`);
  },

  /**
   * POST /api/admin/orders/{id}/gift-case — give a gift case: the server draws the prize now among the
   * case prizes in stock and adds it for free (SEALED; the customer opens it after paying).
   * 400 (Russian message): the order already has a case / no prizes in stock / not editable.
   */
  grantGiftCase: (id: string, tier: CaseTier, notifyCustomer: boolean) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/gift-case`, { tier, notifyCustomer }),

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
    // Older online refunds were logged as "order" (lower case) — keep them in the history.
    return rows.filter((r) => r.entityType?.toUpperCase() === "ORDER" && r.entityId === id);
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
