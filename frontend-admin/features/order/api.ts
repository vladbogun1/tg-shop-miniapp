/**
 * Эндпоинты заказа: доска, список, карточка, статус, доставка, ТТН, позиции, скидка, слияние, архив,
 * кейс, чат, шаблоны ответов, история. Возвраты/обмен — `features/returns`, оплата — `features/payment`.
 * Единственное место с путями `/api/admin/orders…` этой фичи.
 */
import type { Schemas } from "@shop/core/api/schemas";
import type { CaseTier } from "@shop/core/giftcase";
import type { NpCity, NpWarehouse, SendMessageRequest } from "@shop/core/types";
import type { ConfirmOptions } from "@shop/ui/confirm";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut, uploadFile, type OrderStatus } from "@/lib/api";
import { periodQuery, type OrdersPeriod } from "./model/period";
import type { MovementChannel } from "@/features/payment";
import type { BoardKey, RejectReasonCode } from "./model/status";

export type { NpCity, NpWarehouse };

/** Заказ у админа: `admin` заполнен (архив, журнал денег, списания, «едет назад», возвраты). */
export type AdminOrderDetail = Schemas["OrderDetailDto"];
export type OrderAdminExtras = Schemas["AdminExtras"];
/** Карточка доски / строка таблицы. */
export type AdminOrderCard = Schemas["OrderCardDto"];
/** Строка полоски картинок карточки; `returning` = её единицы на пути назад. */
export type CardLine = Schemas["CardLine"];
/** Другой открытый заказ того же покупателя для «Объединить» (V71). */
export type MergeCandidate = Schemas["MergeCandidateDto"];
/** POST …/cancel-request/approve — что стало с деньгами. */
export type CancelApproveResult = Schemas["ApproveResponse"];
/** Строка списка «Отправка». */
export type AdminDispatchOrder = Schemas["DispatchOrderDto"];
export type OrderMessage = Schemas["OrderMessageDto"];
export type ReplyTemplate = Schemas["TemplateDto"];
export type ReplyTemplateWrite = Schemas["TemplateUpsertRequest"];
/** Шаблон, заполненный под один заказ, на языке покупателя. */
export type RenderedTemplate = Omit<Schemas["RenderedTemplateDto"], "locale"> & { locale: "uk" | "ru" | "en" };
export type AuditEntry = Schemas["AuditEntryDto"];

/** Доска + настоящие суммы по колонкам с сервера (колонки — пять статусов + RETURNING). */
export type AdminBoard = Omit<Schemas["OrderBoardDto"], "columns" | "counts" | "sums"> & {
  columns: Record<BoardKey, AdminOrderCard[]>;
  counts: Record<BoardKey, number>;
  sums?: Record<string, number>;
};

export interface MergeBody {
  sourceId: string;
  useSourceDelivery: boolean;
  notifyCustomer: boolean;
  note?: string;
}

export interface StatusChangeBody {
  status: OrderStatus;
  trackingNumber?: string;
  rejectReason?: string;
  rejectReasonCode?: RejectReasonCode;
  restock?: boolean;
  /** REJECTED отправленного заказа: посылка едет назад, склад вернётся с «Посылка вернулась». */
  returnInTransit?: boolean;
  /** SHIPPED, хотя онлайн-оплата не пришла — админ подтвердил (см. changeStatusConfirmingUnpaid). */
  shipUnpaid?: boolean;
}

/** Код бэкенда: SHIPPED отказан, потому что онлайн-оплата заказа не пришла. */
export const SHIP_UNPAID_CODE = "ORDER_UNPAID_SHIP";

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

export interface DeliveryPatch {
  customerName?: string;
  phone?: string;
  npCityRef?: string;
  npCityName?: string;
  npWarehouseRef?: string;
  npWarehouseName?: string;
}

/** Размер страницы чата заказа (по умолчанию бэкенда). */
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
  /** Копейки, уже полученные; 0 = ещё не оплачен. */
  paidMinor: number;
  paidChannel: MovementChannel;
  note?: string;
}

export interface AddItemBody {
  productId: string;
  variantId?: string;
  quantity?: number;
  gift?: boolean;
  notifyCustomer?: boolean;
}

export interface DiscountBody {
  promoCode?: string;
  amountMinor?: number;
  percent?: number;
  clear?: boolean;
  notifyCustomer?: boolean;
}

export const orderApi = {
  /** POST /api/admin/orders — ручной заказ (телефон, Instagram, лично). */
  create: (body: AdminCreateOrderBody) => apiPost<AdminOrderDetail>("/api/admin/orders", body),
  board: (params: { q?: string; period?: OrdersPeriod; closedLimit?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.period) for (const [k, v] of Object.entries(periodQuery(params.period))) sp.set(k, v);
    if (params.closedLimit) sp.set("closedLimit", String(params.closedLimit));
    const qs = sp.toString();
    return apiGet<AdminBoard>(`/api/admin/orders/board${qs ? `?${qs}` : ""}`);
  },

  order: (id: string) => apiGet<AdminOrderDetail>(`/api/admin/orders/${id}`),

  changeStatus: (id: string, body: StatusChangeBody) => apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/status`, body),

  /** PATCH …/tracking — поправить ТТН после отправки (покупатель уведомляется). */
  updateTracking: (id: string, trackingNumber: string) =>
    apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/tracking`, { trackingNumber }),

  /** PATCH …/delivery — получатель / телефон / город и отделение НП. */
  updateDelivery: (id: string, patch: DeliveryPatch) => apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/delivery`, patch),

  /** GET …/merge-candidates — другие открытые заказы того же покупателя (V71). */
  mergeCandidates: (id: string) => apiGet<MergeCandidate[]>(`/api/admin/orders/${id}/merge-candidates`),

  /** POST …/merge — влить `sourceId` в этот заказ; возвращает этот заказ. */
  merge: (id: string, body: MergeBody) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/merge`, body),

  /** POST …/archive — только главный админ; заказы не удаляются. */
  archive: (id: string, reason: string) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/archive`, { reason }),

  /** POST …/unarchive — только главный админ. */
  unarchive: (id: string) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/unarchive`),

  /** GET /api/admin/orders (плоский массив); `archived` = только архивные (по умолчанию — без них). */
  list: (params: {
    status?: string;
    q?: string;
    period?: OrdersPeriod;
    page?: number;
    size?: number;
    sortBy?: string;
    sortDir?: string;
    archived?: boolean;
  }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.q) sp.set("q", params.q);
    if (params.period) for (const [k, v] of Object.entries(periodQuery(params.period))) sp.set(k, v);
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 20));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    if (params.archived) sp.set("archived", "true");
    return apiGet<AdminOrderCard[]>(`/api/admin/orders?${sp.toString()}`);
  },

  /**
   * POST …/gift-case — выдать кейс: сервер сразу разыгрывает приз среди призов кейса в наличии и добавляет
   * его бесплатно (SEALED; покупатель откроет после оплаты).
   * 400 (русский текст): у заказа уже есть кейс / нет призов в наличии / заказ не редактируется.
   */
  grantGiftCase: (id: string, tier: CaseTier, notifyCustomer: boolean) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/gift-case`, { tier, notifyCustomer }),

  /** Добавить позицию (платную или подарок при gift=true). */
  addItem: (id: string, body: AddItemBody) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/items`, body),
  /** Изменить количество позиции (резервирует/освобождает склад). */
  changeItemQty: (id: string, itemId: number, body: { quantity: number; notifyCustomer?: boolean }) =>
    apiPatch<AdminOrderDetail>(`/api/admin/orders/${id}/items/${itemId}`, body),
  /** Убрать позицию, вернув остаток на склад. */
  removeItem: (id: string, itemId: number) => apiDelete<AdminOrderDetail>(`/api/admin/orders/${id}/items/${itemId}`),
  /** Скидка: промокод, ручная сумма/процент или сброс. */
  applyDiscount: (id: string, body: DiscountBody) => apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/discount`, body),

  /** Запрос отмены от покупателя: отмена (CHANGED_MIND) + возврат на склад + полный возврат monobank. */
  approveCancelRequest: (id: string, comment?: string) =>
    apiPost<CancelApproveResult>(`/api/admin/orders/${id}/cancel-request/approve`, { comment }),

  /** Отклонить запрос отмены; комментарий (обязателен) уходит покупателю. */
  declineCancelRequest: (id: string, comment: string) =>
    apiPost<AdminOrderDetail>(`/api/admin/orders/${id}/cancel-request/decline`, { comment }),

  dispatch: (includeNew = true) =>
    apiGet<AdminDispatchOrder[]>(`/api/admin/orders/dispatch${includeNew ? "?includeNew=true" : ""}`),

  // ---- чат ----
  /** Страница чата: последние `limit` сообщений до `before` (старые сверху). */
  messages: (id: string, before?: number, limit = CHAT_PAGE) => {
    const sp = new URLSearchParams();
    if (before) sp.set("before", String(before));
    sp.set("limit", String(limit));
    return apiGet<OrderMessage[]>(`/api/admin/orders/${id}/messages?${sp.toString()}`);
  },
  sendMessage: (id: string, body: SendMessageRequest) => apiPost<OrderMessage>(`/api/admin/orders/${id}/messages`, body),
  markRead: (id: string) => apiPost<void>(`/api/admin/orders/${id}/messages/read`),
  /** Вложение чата (картинка или PDF) -> { key }: хранится приватно в chat/, не с фото товаров. */
  uploadChatAttachment: (id: string, file: File) => uploadFile(`/api/admin/orders/${id}/attachments`, file),

  /**
   * История одного заказа из журнала действий админов. Фильтры `entityType`/`entityId` сервер
   * знает; на старом бэкенде он их игнорировал и отдавал последние записи, поэтому фильтруем и тут.
   */
  orderAudit: async (id: string) => {
    const rows = await apiGet<AuditEntry[]>(`/api/admin/audit?entityType=ORDER&entityId=${encodeURIComponent(id)}&size=200`);
    // Старые онлайн-возвраты писались как "order" (в нижнем регистре) — оставляем их в истории.
    return rows.filter((r) => r.entityType?.toUpperCase() === "ORDER" && r.entityId === id);
  },

  /** Карточка покупателя — открыть поверх заказа. */
  npCities: (q: string) => apiGet<NpCity[]>(`/api/np/cities?q=${encodeURIComponent(q)}`),
  npWarehouses: (cityRef: string, q: string) =>
    apiGet<NpWarehouse[]>(`/api/np/warehouses?cityRef=${encodeURIComponent(cityRef)}&q=${encodeURIComponent(q)}`),

  // ---- шаблоны ответов (N5) ----
  replyTemplates: () => apiGet<ReplyTemplate[]>("/api/admin/reply-templates"),
  createReplyTemplate: (body: ReplyTemplateWrite) => apiPost<ReplyTemplate>("/api/admin/reply-templates", body),
  updateReplyTemplate: (id: number, body: ReplyTemplateWrite) => apiPut<ReplyTemplate>(`/api/admin/reply-templates/${id}`, body),
  deleteReplyTemplate: (id: number) => apiDelete<void>(`/api/admin/reply-templates/${id}`),
  renderedTemplates: (orderId: string) => apiGet<RenderedTemplate[]>(`/api/admin/orders/${orderId}/reply-templates`),
};

/**
 * PATCH статуса; если сервер отказывает в SHIPPED, потому что предоплата / онлайн-оплата не пришла
 * (ORDER_UNPAID_SHIP), спрашивает админа и повторяет с `shipUnpaid` — сервер запишет в историю
 * «отправлен без онлайн-оплаты по решению админа». null = админ отказался.
 */
export async function changeStatusConfirmingUnpaid(
  id: string,
  body: StatusChangeBody,
  confirm: Confirm
): Promise<AdminOrderDetail | null> {
  try {
    return await orderApi.changeStatus(id, body);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== SHIP_UNPAID_CODE) throw e;
    // «Предоплата по заказу #… не пришла (не хватает …).» — первое предложение текста сервера.
    const head = e.message.match(/^.*?\)\./)?.[0] ?? e.message;
    const ok = await confirm({
      title: "Отправить без предоплаты?",
      message: `${head} Отправить всё равно? (например, договорились в чате) В истории заказа запишется, что он отправлен без предоплаты по вашему решению.`,
      confirmLabel: "Отправить всё равно",
      danger: true,
    });
    if (!ok) return null;
    return orderApi.changeStatus(id, { ...body, shipUnpaid: true });
  }
}
