/**
 * The API contract, typed once.
 *
 * <p>Both apps used to keep their own copies of these interfaces, which had already drifted apart
 * and away from the server: ids that the backend sends as numbers were declared `string`
 * (`Message.id`, `replyToMessageId`, `OrderItem.id`), and the customer app read `user.id` from a
 * payload whose field is actually `userId`, so it was always `undefined`.
 */

export type OrderStatus = "NEW" | "APPROVED" | "SHIPPED" | "DELIVERED" | "REJECTED";
export type DeliveryMethod = "NOVA_POSHTA" | "PICKUP";
export type SenderType = "CUSTOMER" | "ADMIN" | "SYSTEM";
export type MessageType = "TEXT" | "PHOTO" | "FILE" | "SYSTEM";
export type TimeRange = "month" | "halfyear" | "year" | "all";

// ---- catalog ----------------------------------------------------------------

export interface ProductImage {
  /** Auto-increment id from the database. */
  id?: number;
  /** S3 object key, or an absolute http(s) url for legacy/migrated images. */
  url?: string;
  sortOrder?: number;
}

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

export interface Product {
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
}

// ---- orders -----------------------------------------------------------------

export interface OrderItem {
  /** order_items.id — an auto-increment number, not a UUID. */
  id?: number;
  productId?: string;
  variantId?: string | null;
  title: string;
  variantName?: string | null;
  quantity: number;
  priceMinor: number;
  currency?: string;
  imageUrl?: string | null;
  gift?: boolean;
}

export interface PaymentRequisites {
  cardNumber?: string;
  iban?: string;
  recipient?: string;
  edrpou?: string;
  purpose?: string;
  note?: string;
}

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  createdAt: string;
  itemsCount: number;
  unreadCount: number;
  /** Payment confirmed by an admin. */
  paid: boolean;
  /** Customer uploaded a transfer screenshot; awaiting confirmation. */
  paymentClaimed: boolean;
}

export interface OrderDetail {
  id: string;
  status: OrderStatus;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: string;
  customerName: string;
  phone: string;
  comment?: string | null;
  promoCode?: string | null;
  deliveryMethod: DeliveryMethod;
  npCityName?: string | null;
  npWarehouseName?: string | null;
  paymentOptionTitle?: string | null;
  trackingNumber?: string | null;
  rejectReason?: string | null;
  items: OrderItem[];
  requisites?: PaymentRequisites | null;
  paid: boolean;
  paidAt?: string | null;
  prepaymentMinor: number;
  receivedMinor: number;
  paymentClaimed: boolean;
  paymentClaimedAt?: string | null;
  createdAt: string;
  approvedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  rejectedAt?: string | null;
  /** Admin-only extras (GET /api/admin/orders/{id}). */
  tgUserId?: number | null;
  tgUsername?: string | null;
}

export interface OrderCard {
  id: string;
  customerName: string;
  totalMinor: number;
  currency: string;
  itemsCount: number;
  deliveryMethod: DeliveryMethod;
  paymentOptionTitle: string;
  unreadCount: number;
  createdAt: string;
  status: OrderStatus;
  paid: boolean;
  paymentClaimed: boolean;
}

// ---- chat -------------------------------------------------------------------

export interface Message {
  /** order_messages.id — an auto-increment number. */
  id: number;
  orderId: string;
  senderType: SenderType;
  senderName?: string | null;
  type: MessageType;
  text?: string | null;
  /**
   * Ready-to-use, short-lived signed URL (`/api/media?...`) — NOT a raw storage key.
   * Attachments live in a private bucket, so only this link can fetch them.
   */
  attachmentUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  replyToMessageId?: number | null;
  createdAt: string;
  readAt?: string | null;
}

export interface SendMessageRequest {
  text?: string;
  type: MessageType;
  /** Storage key returned by the upload endpoint (the server signs it on the way out). */
  attachmentUrl?: string;
  fileName?: string;
  mimeType?: string;
  replyToMessageId?: number;
}

export interface Conversation {
  orderId: string;
  shortId: string;
  customerName?: string | null;
  status: OrderStatus;
  lastPreview: string;
  lastSenderType?: SenderType | null;
  lastAt?: string | null;
  unreadCount: number;
}

// ---- payment / delivery -----------------------------------------------------

export interface PaymentOption {
  id: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number;
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
