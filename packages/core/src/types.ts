/**
 * The API contract, typed once.
 *
 * <p>Both apps used to keep their own copies of these interfaces, which had already drifted apart
 * and away from the server: ids that the backend sends as numbers were declared `string`
 * (`Message.id`, `replyToMessageId`, `OrderItem.id`), and the customer app read `user.id` from a
 * payload whose field is actually `userId`, so it was always `undefined`.
 */

/** Order status: the union generated from the backend enum, so a new status breaks typecheck wherever it is tabulated. */
export type OrderStatus = Schemas["OrderCardDto"]["status"];
export type DeliveryMethod = "NOVA_POSHTA" | "PICKUP";
export type SenderType = "CUSTOMER" | "ADMIN" | "SYSTEM";
export type MessageType = "TEXT" | "PHOTO" | "FILE" | "SYSTEM";
export type TimeRange = "month" | "halfyear" | "year" | "all";

// ---- catalog ----------------------------------------------------------------

import type { Schemas } from "./api/schemas";
import type { CatalogFields } from "./catalog";

export interface ProductImage {
  /** Auto-increment id from the database. */
  id?: number;
  /** S3 object key, or an absolute http(s) url for legacy/migrated images. */
  url?: string;
  sortOrder?: number;
}

/** @deprecated V52 — products have one category (`categoryId`), see catalog.ts. Kept while old payloads exist. */
export interface ProductTag {
  id: string;
  name: string;
}

export interface ProductVariant {
  /** UUID. Send it back when saving so the server keeps the row instead of recreating it. */
  id?: string;
  name: string;
  stock: number;
  sortOrder?: number;
}

export interface Product extends CatalogFields {
  id: string;
  title: string;
  description?: string;
  priceMinor: number;
  currency?: string;
  stock?: number;
  active?: boolean;
  archived?: boolean;
  /** Units sold (excludes cancelled orders and gifts). */
  soldCount?: number;
  images?: ProductImage[];
  variants?: ProductVariant[];
  tags?: ProductTag[];
  /** Average of the published reviews (V44); null/absent while there are none. */
  ratingAvg?: number | null;
  /** Number of published reviews (V44). */
  ratingCount?: number;
}

// ---- reviews (V44) ------------------------------------------------------------

export type ReviewStatus = Schemas["MyReview"]["status"];

/** Rating summary; `distribution[0]` = number of 1★ reviews … `[4]` = 5★. */
export type ReviewSummary = Schemas["ReviewSummary"];

/** A published review. Empty `author` = show a localized "Customer". */
export type PublicReview = Schemas["PublicReview"];

/** One quote of the site's home-page reviews ribbon: the review plus the product it is about. */
export type FeedReview = Schemas["FeedReview"];

/** `GET /api/public/reviews/latest?size=` — shop-wide summary and the newest reviews with a text. */
export type ReviewFeed = Schemas["ReviewFeed"];

/** `GET /api/public/products/{idOrSlug}/reviews?page=&size=` (page is 0-based). */
export type ReviewPage = Schemas["ReviewPage"];

/** `GET /api/me/reviews/pending[?orderId=]` — a delivered order line still waiting for a review. */
export type PendingReviewLine = Schemas["PendingLine"];

/** `GET /api/me/reviews` — one of my reviews. `editable` = still PENDING (may be re-submitted). */
export type MyReview = Schemas["MyReview"];

/** `GET /api/me/bonuses` — a personal promo code (review bonus or a case prize). */
export type BonusCode = Schemas["Bonus"];

/** `POST /api/me/reviews` body. */
export interface SubmitReviewRequest {
  orderItemId: number;
  rating: number;
  text: string;
}

/** `POST /api/me/reviews` answer; `bonus` is set when this review earned the code right away. */
export interface SubmitReviewResult {
  review: MyReview;
  bonus?: BonusCode | null;
}

/** Admin `GET /api/admin/reviews?status=&productId=&page=&size=` row. */
export type AdminReview = Schemas["AdminReview"];
export type AdminReviewPage = Schemas["AdminPage"];

// ---- orders -----------------------------------------------------------------

/** Строка заказа (OrderItemDto бэкенда). */
export type OrderItem = Schemas["OrderItemDto"];

/** Latest monobank invoice state: "none" = the customer never opened the payment page. */
export type OnlinePaymentStatus = Schemas["AdminInvoiceDto"]["status"];

/** Онлайн-оплата (monobank) заказа — OrderDetail.payment. */
export type OnlinePayment = Schemas["OnlinePaymentDto"];

/** POST /api/me/orders/{id}/payment — send the customer to pageUrl. */
export type PaymentStart = Schemas["PaymentStartResponse"];

/** POST /api/orders: дальше старт оплаты для orderId. */
export type CreateOrderResult = Schemas["CreateOrderResponse"];

/** GET /api/admin/orders/{id}/payments — one monobank invoice. */
export type AdminInvoice = Schemas["AdminInvoiceDto"];

/** Заказ в списке покупателя (GET /api/me/orders). */
export type OrderSummary = Schemas["OrderSummaryDto"];

/** Customer's request to cancel a PAID order (one per order). */
export type CancelRequestStatus = "PENDING" | "APPROVED" | "DECLINED";

/** GET /api/public/order-limits — антибот-лимиты; 0  */
export type OrderLimits = Schemas["Limits"];

/** Заказ целиком; у покупателя admin  */
export type OrderDetail = Schemas["OrderDetailDto"];

/** Карточка заказа на доске админки. */
export type OrderCard = Schemas["OrderCardDto"];

// ---- chat -------------------------------------------------------------------

/** Сообщение чата заказа. */
export type Message = Schemas["OrderMessageDto"];

export interface SendMessageRequest {
  text?: string;
  type: MessageType;
  /** Storage key returned by the upload endpoint (the server signs it on the way out). */
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
  replyToMessageId?: number;
}

/** Беседа в списке чатов. */
export type Conversation = Schemas["ConversationDto"];

// ---- payment / delivery -----------------------------------------------------

export interface PaymentOption {
  id: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number;
}

/**
 * What a promo code is worth for the current cart.
 *
 * Returned both by the public preview (`GET /api/promo-codes/preview`) and by the authenticated
 * hold (`POST /api/me/promo/reserve`); only the latter ever fills `reservedUntil`.
 */
export interface PromoPreview {
  valid: boolean;
  discountMinor: number;
  totalMinor: number;
  message?: string | null;
  /** ISO instant until which a LIMITED code is held for this customer; null when unlimited. */
  reservedUntil?: string | null;
}

export interface NpCity {
  ref: string;
  name: string;
  area?: string;
}

export type NpCategory = "POSTOMAT" | "BRANCH" | "POINT" | "OTHER";

export interface NpWarehouse {
  ref: string;
  number?: string | number;
  description: string;
  type?: string;
  category?: NpCategory;
  cityRef?: string | null;
  cityName?: string | null;
  lat?: number | null;
  lng?: number | null;
}

// ---- auth -------------------------------------------------------------------

export interface AuthUser {
  /** Telegram user id. Named `userId` on the wire — not `id`. */
  userId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  admin: boolean;
}

export interface AuthResponse {
  accessToken: string;
  /** Null for admin-only auth. */
  user: AuthUser | null;
}
