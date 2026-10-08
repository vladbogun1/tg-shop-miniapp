/**
 * Admin API client.
 *
 * The fetch plumbing, error type and the DTOs shared with the customer app live in
 * `@shop/shared`; this file keeps only what is admin-specific — the localStorage-backed token,
 * the admin-only payloads, and the typed endpoint list.
 */
import {
  ApiError,
  createHttpClient,
  type AdminInvoice,
  type MonobankStatus,
  type Receipt,
  normalizeBaseUrl,
  type DeliveryMethod,
  type Message,
  type OrderCard,
  type OrderDetail,
  type OrderStatus,
  type Product,
  type ProductImage,
  type ProductTag,
  type ProductVariant,
  type SendMessageRequest,
  type SenderType,
  type TimeRange,
  type CardStatus,
  type ProductCondition,
  type ProductSpecs,
  type SpecType,
  type SpecValue,
} from "@shop/shared";

export { ApiError };
export type {
  AdminInvoice,
  Receipt,
  DeliveryMethod,
  Message,
  MonobankStatus,
  OrderStatus,
  Product,
  ProductImage,
  ProductTag,
  ProductVariant,
  SendMessageRequest,
  SenderType,
  TimeRange,
  CardStatus,
  ProductCondition,
  ProductSpecs,
  SpecType,
  SpecValue,
};

/** Where an order was placed (backend `orders.source`). */
export type OrderSource = "MINIAPP" | "WEB" | "ADMIN";

/** Names the admin UI already uses for the shared shapes (+ admin-only fields). */
export type OrderCardDto = OrderCard & { source?: OrderSource };
/** `customerLocale`: uk/ru/en chosen by the customer in the shop (users.locale) — answer in it. */
export type OrderDetailDto = OrderDetail & { source?: OrderSource; customerLocale?: string | null };

/**
 * Product as the admin API returns it: the shared shape plus the public-site fields
 * (URL slug, struck-through "old" price, SEO overrides) and the catalog v2 card fields
 * (docs/CATALOG-SPECS.md §3.3). Kept here so the Mini App's shared types stay untouched.
 */
export type AdminProduct = Product & {
  slug?: string;
  compareAtMinor?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  /** Article number (unique when set); null = the site uses the id. */
  sku?: string | null;
  /** Card workflow (not shown on the storefront): DRAFT → AI_FILLED → READY. */
  cardStatus?: CardStatus;
  /** Overall AI confidence of the last import, 0..100. */
  cardConfidence?: number | null;
  cardMeta?: CardMeta | null;
  /** Required attribute keys without a value, when the backend computes it (else computed client-side). */
  missingRequired?: string[] | null;
  /** V53: created via the short admin form and not yet published/archived («Незавершён»). */
  unfinished?: boolean;
};

/** products.card_meta — per-field AI confidence and sources of the last «Карточки» import. */
export interface CardMeta {
  fields?: Record<string, { c?: number | null; src?: string | null }>;
  sources?: string[];
  notes?: string | null;
  model?: string | null;
  importedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

/** What the validator dropped on save (unknown key, option not in the list, bad number…). */
export interface SpecIssue {
  key: string;
  reason: string;
}

export type AdminProductSaved = AdminProduct & { specIssues?: SpecIssue[] | null };

// ---- catalog v2: categories, brands, characteristics (docs/CATALOG-SPECS.md §3.2) ----

/**
 * Category of the 2-level tree. `productCount` = products of the whole subtree,
 * `productCountDirect` = products lying in this very category (only leaves can hold products).
 * SEO fields: Russian source, empty = the site's template; uk/en on the «Переводы» screen.
 */
export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  showInMenu: boolean;
  /** Tile art of the site; null = guessed from the slug. */
  artKind?: string | null;
  productCount: number;
  productCountDirect: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  h1?: string | null;
  introText?: string | null;
}

export interface CategoryWriteRequest {
  name: string;
  /** Blank = generate from the name. */
  slug?: string;
  parentId?: string | null;
  sortOrder?: number;
  showInMenu?: boolean;
  /** null = «авто» (by slug). */
  artKind?: string | null;
  /** SEO fields: omitted = keep, "" = clear. */
  seoTitle?: string;
  seoDescription?: string;
  h1?: string;
  introText?: string;
}

export interface CategoryReorderItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  /** Other spellings used to recognise the brand (AI answers, «Создать „…“»). */
  aliases: string[];
  website?: string | null;
  sortOrder?: number;
  productCount: number;
}

export interface BrandWriteRequest {
  name: string;
  slug?: string;
  aliases?: string[];
  website?: string;
  sortOrder?: number;
}

export interface AdminSpecOption {
  id?: string;
  /** Slug stored in product specs. */
  value: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  aliases: string[];
  sortOrder: number;
  /** Products whose specs use this option (when the backend reports it). */
  usedCount?: number;
}

export interface AdminSpecBucket {
  /** Inclusive; null = open. */
  min: number | null;
  max: number | null;
  labelRu: string;
  labelUk: string;
  labelEn: string;
}

/** Attribute with all three languages, as the editor sees it. */
export interface AdminSpecAttribute {
  id: string;
  /** null = global (every category). */
  categoryId: string | null;
  key: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  type: SpecType;
  unitRu?: string | null;
  unitUk?: string | null;
  unitEn?: string | null;
  /** number only: stored as {min,max}. */
  range: boolean;
  group: string;
  filterable: boolean;
  comparable: boolean;
  required: boolean;
  highlight: boolean;
  sortOrder: number;
  buckets: AdminSpecBucket[] | null;
  hint?: string | null;
  options: AdminSpecOption[];
  /** GET ?categoryId=: defined on a parent (or global), read-only here. */
  inherited?: boolean;
  /** Products whose specs have this key. */
  usedCount?: number;
}

export type SpecAttributeWriteRequest = Omit<AdminSpecAttribute, "id" | "inherited" | "usedCount">;

export interface AdminSpecGroup {
  key: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  sortOrder: number;
}

/** GET /api/admin/catalog/schema — everything, all languages (editor, wizard, prompt). */
export interface AdminCatalogSchema {
  categories: AdminCategory[];
  brands: AdminBrand[];
  groups: AdminSpecGroup[];
  attributes: AdminSpecAttribute[];
}

// The backend may answer with DB-ish names (group_key/sort_order/is_range, aliases as "a\nb",
// type in caps): these normalisers keep the UI on one shape whatever the exact JSON is.
type Loose = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
function pick(o: Loose, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}
function aliasList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(str).map((x) => x.trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return [];
}

export function normCategory(raw: unknown): AdminCategory {
  const o = (raw ?? {}) as Loose;
  return {
    id: str(o.id),
    slug: str(o.slug),
    name: str(pick(o, "name", "name_ru")),
    parentId: strOrNull(o.parentId),
    sortOrder: num(pick(o, "sortOrder", "sort_order")),
    showInMenu: pick(o, "showInMenu", "show_in_menu") !== false,
    artKind: strOrNull(pick(o, "artKind", "art_kind")),
    productCount: num(pick(o, "productCount", "product_count")),
    productCountDirect: num(pick(o, "productCountDirect", "product_count_direct"), num(pick(o, "productCount", "product_count"))),
    seoTitle: strOrNull(o.seoTitle),
    seoDescription: strOrNull(o.seoDescription),
    h1: strOrNull(o.h1),
    introText: strOrNull(o.introText),
  };
}

export function normBrand(raw: unknown): AdminBrand {
  const o = (raw ?? {}) as Loose;
  return {
    id: str(o.id),
    name: str(o.name),
    slug: str(o.slug),
    aliases: aliasList(o.aliases),
    website: strOrNull(pick(o, "website", "site", "url")),
    sortOrder: num(o.sortOrder),
    productCount: num(o.productCount),
  };
}

const SPEC_TYPES: SpecType[] = ["number", "enum", "multi", "bool", "text"];

function normLabels(x: Loose) {
  return {
    labelRu: str(pick(x, "labelRu", "label_ru", "label")),
    labelUk: str(pick(x, "labelUk", "label_uk")),
    labelEn: str(pick(x, "labelEn", "label_en")),
  };
}

export function normAttribute(raw: unknown): AdminSpecAttribute {
  const o = (raw ?? {}) as Loose;
  const t = str(o.type).toLowerCase() as SpecType;
  const unit = (o.unit && typeof o.unit === "object" ? o.unit : {}) as Loose;
  const facet = (o.facet && typeof o.facet === "object" ? o.facet : {}) as Loose;
  const buckets = o.buckets ?? facet.buckets;
  const used = pick(o, "usedCount", "productCount");
  return {
    id: str(o.id),
    categoryId: strOrNull(o.categoryId),
    key: str(o.key),
    ...normLabels(o),
    type: SPEC_TYPES.includes(t) ? t : "text",
    unitRu: strOrNull(pick(o, "unitRu") ?? unit.ru ?? (typeof o.unit === "string" ? o.unit : undefined)),
    unitUk: strOrNull(pick(o, "unitUk") ?? unit.uk),
    unitEn: strOrNull(pick(o, "unitEn") ?? unit.en),
    range: pick(o, "range", "isRange") === true,
    group: str(pick(o, "group", "groupKey")) || "main",
    filterable: o.filterable === true,
    comparable: o.comparable === true,
    required: pick(o, "required", "requiredForReady", "required_for_ready") === true,
    highlight: o.highlight === true,
    sortOrder: num(pick(o, "sortOrder", "sort")),
    buckets: Array.isArray(buckets)
      ? buckets.map((b) => {
          const x = (b ?? {}) as Loose;
          return { min: numOrNull(x.min), max: numOrNull(x.max), ...normLabels(x) };
        })
      : null,
    hint: strOrNull(pick(o, "hint", "hintRu", "hint_ru")),
    options: (Array.isArray(o.options) ? o.options : []).map((op, i) => {
      const x = (op ?? {}) as Loose;
      return {
        id: strOrNull(x.id) ?? undefined,
        value: str(x.value),
        ...normLabels(x),
        aliases: aliasList(x.aliases),
        sortOrder: num(pick(x, "sortOrder", "sort"), i * 10),
        usedCount: typeof x.usedCount === "number" ? x.usedCount : undefined,
      };
    }),
    inherited: o.inherited === true,
    usedCount: typeof used === "number" ? used : undefined,
  };
}

export function normGroup(raw: unknown, i = 0): AdminSpecGroup {
  const o = (raw ?? {}) as Loose;
  return { key: str(o.key), ...normLabels(o), sortOrder: num(pick(o, "sortOrder", "sort"), i * 10) };
}

/** Request body of an attribute: the backend names the order `sort` (attributes and options). */
function attributeBody(a: Partial<SpecAttributeWriteRequest>) {
  const { sortOrder, options, ...rest } = a;
  return {
    ...rest,
    ...(sortOrder !== undefined ? { sort: sortOrder } : {}),
    ...(options !== undefined
      ? {
          options: options.map((o) => ({
            value: o.value,
            labelRu: o.labelRu,
            labelUk: o.labelUk,
            labelEn: o.labelEn,
            aliases: o.aliases,
            sort: o.sortOrder,
          })),
        }
      : {}),
  };
}

export type MessageDto = Message;

const API_BASE = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, "http://localhost:8080");

export const apiOrigin = API_BASE;

/** A signed, server-relative receipt link (`/api/receipts/file?…`) → absolute, on the API origin. */
export function receiptHref(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

// ---- token store (localStorage) --------------------------------------------
const TOKEN_KEY = "tgshop_admin_jwt";
let accessToken: string | null = null;

const unauthorizedListeners = new Set<() => void>();

export function onUnauthorized(cb: () => void): () => void {
  unauthorizedListeners.add(cb);
  return () => unauthorizedListeners.delete(cb);
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem(TOKEN_KEY);
  }
  return accessToken;
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

function dropSession(): void {
  setAccessToken(null);
  unauthorizedListeners.forEach((cb) => cb());
}

/**
 * «Выйти»: the server revokes THIS token (other devices stay logged in), then the session is
 * dropped locally. Fire-and-forget — leaving must work even when the backend is unreachable.
 */
export function logout(): void {
  const token = getAccessToken();
  if (token) {
    void fetch(`${API_BASE}/api/admin/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      keepalive: true,
    }).catch(() => undefined);
  }
  dropSession();
}

/** «Выйти на всех устройствах»: every token of this admin dies (token_version + 1). */
export async function logoutEverywhere(): Promise<void> {
  await http.post<void>("/api/admin/logout-all");
  dropSession();
}

// ---- quiet token renewal ----------------------------------------------------
// Admin tokens are short-lived (12 h by default). Once the current one is past half its life,
// the next API call triggers one background refresh, so a panel in use never logs out while an
// abandoned one simply expires.

interface TokenTimes {
  iat: number;
  exp: number;
  /** Tokens from before short admin tokens had no id — those are swapped right away. */
  hasId: boolean;
}

function tokenTimes(token: string): TokenTimes | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { iat?: number; exp?: number; jti?: string };
    if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return null;
    return { iat: claims.iat, exp: claims.exp, hasId: !!claims.jti };
  } catch {
    return null;
  }
}

const REFRESH_RETRY_MS = 60_000;
let refreshing = false;
let lastRefreshAttempt = 0;

function maybeRefresh(token: string): void {
  if (refreshing || typeof window === "undefined") return;
  const t = tokenTimes(token);
  if (!t) return;
  const now = Date.now() / 1000;
  if (now >= t.exp) return; // already expired: the request will 401 and show the login screen
  const halfLife = t.iat + (t.exp - t.iat) / 2;
  if (t.hasId && now < halfLife) return;
  if (Date.now() - lastRefreshAttempt < REFRESH_RETRY_MS) return;
  lastRefreshAttempt = Date.now();
  refreshing = true;
  // Plain fetch, not the client: a failed refresh must not log the admin out — the current token
  // is still valid, and the next call after a minute simply tries again.
  fetch(`${API_BASE}/api/admin/token/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as AdminAuthResponse;
      // Only if nobody logged out / in meanwhile.
      if (body.accessToken && getAccessToken() === token) setAccessToken(body.accessToken);
    })
    .catch(() => undefined)
    .finally(() => {
      refreshing = false;
    });
}

const http = createHttpClient({
  baseUrl: API_BASE,
  // The «trusted device» cookie (HttpOnly, path /api/auth/admin) has to travel with the sign-in
  // calls; prod is same-origin anyway, the e2e/dev split origins need "include".
  credentials: "include",
  getToken: () => {
    const token = getAccessToken();
    if (token) maybeRefresh(token);
    return token;
  },
  onUnauthorized: () => {
    dropSession();
  },
});

export const apiGet = http.get;
export const apiPost = http.post;
export const apiPatch = http.patch;
export const apiPut = http.put;
export const apiDelete = http.del;

/** Multipart upload -> { key } (POST /api/admin/uploads). */
export function uploadFile(path: string, file: File): Promise<{ key: string }> {
  return http.upload<{ key: string }>(path, file);
}

// ---- admin auth ------------------------------------------------------------
// Two steps: password or Telegram → { status: TOTP_REQUIRED | SETUP_REQUIRED, preAuthToken } → the
// code from the authenticator app (or the 2FA setup) → { status: OK, accessToken }. A remembered
// device («Доверять этому устройству») answers OK right after the first step.
export interface AdminAuthResponse {
  accessToken: string;
}

export type AdminLoginStatus = "OK" | "TOTP_REQUIRED" | "SETUP_REQUIRED";

export interface AdminLoginResult {
  status: AdminLoginStatus;
  accessToken?: string;
  /** 5-minute token for the second step; grants nothing else. Kept in memory only. */
  preAuthToken?: string;
  name?: string;
}

export interface TwoFactorSetup {
  /** Base32 secret for manual entry. */
  secret: string;
  /** otpauth://totp/… — the QR content; opens the authenticator on the same phone. */
  otpauthUri: string;
  account: string;
  issuer: string;
}

function signedIn(res: AdminLoginResult): AdminLoginResult {
  if (res.status === "OK" && res.accessToken) setAccessToken(res.accessToken);
  return res;
}

/** POST /api/auth/admin/telegram { initData } — first factor. */
export async function authAdminTelegram(initData: string): Promise<AdminLoginResult> {
  return signedIn(await http.post<AdminLoginResult>("/api/auth/admin/telegram", { initData }));
}

/** POST /api/auth/admin/login { username, password } — first factor. */
export async function authAdminLogin(username: string, password: string): Promise<AdminLoginResult> {
  return signedIn(await http.post<AdminLoginResult>("/api/auth/admin/login", { username, password }));
}

/** POST /api/auth/admin/2fa/verify — the code from the app. */
export async function verifyTwoFactor(preAuthToken: string, code: string, trustDevice: boolean): Promise<AdminLoginResult> {
  return signedIn(await http.post<AdminLoginResult>("/api/auth/admin/2fa/verify", { preAuthToken, code, trustDevice }));
}

/** POST /api/auth/admin/2fa/setup — first sign-in without 2FA: a new secret. */
export function startTwoFactorSetup(preAuthToken: string): Promise<TwoFactorSetup> {
  return http.post<TwoFactorSetup>("/api/auth/admin/2fa/setup", { preAuthToken });
}

/** POST /api/auth/admin/2fa/confirm — the first code from the new secret; signs in. */
export async function confirmTwoFactorSetup(
  preAuthToken: string,
  code: string,
  trustDevice: boolean
): Promise<AdminLoginResult> {
  return signedIn(await http.post<AdminLoginResult>("/api/auth/admin/2fa/confirm", { preAuthToken, code, trustDevice }));
}

// ---- «Мой аккаунт» -----------------------------------------------------------

export interface AdminAccount {
  telegramUserId: number;
  name: string | null;
  username: string | null;
  role: "ADMIN" | "SUPER_ADMIN";
  superAdmin: boolean;
  passwordSet: boolean;
  passwordChangedAt: string | null;
  totpEnabled: boolean;
  totpEnabledAt: string | null;
  trustedDevices: number;
  trustedDeviceDays: number;
}

export type LoginResultCode = "OK" | "BAD_PASSWORD" | "UNKNOWN_LOGIN" | "BAD_CODE" | "LOCKED" | "NOT_ADMIN" | "BAD_TELEGRAM";

export interface AdminLoginEntry {
  id: number;
  at: string;
  method: "PASSWORD" | "TELEGRAM" | "INVITE";
  result: LoginResultCode;
  secondFactor: "TOTP" | "TRUSTED_DEVICE" | "SETUP" | null;
  ip: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  newDevice: boolean;
  newCity: boolean;
}

export const accountApi = {
  get: () => http.get<AdminAccount>("/api/admin/account"),
  logins: () => http.get<AdminLoginEntry[]>("/api/admin/account/logins"),
  /** Ends every other session; the answer carries this device's new token (stored here). */
  async changePassword(currentPassword: string, newPassword: string, code: string): Promise<void> {
    const res = await http.post<AdminAuthResponse>("/api/admin/account/password", { currentPassword, newPassword, code });
    setAccessToken(res.accessToken);
  },
  startTotpReset: (code: string) => http.post<TwoFactorSetup>("/api/admin/account/2fa/reset", { code }),
  async confirmTotpReset(code: string): Promise<void> {
    const res = await http.post<AdminAuthResponse>("/api/admin/account/2fa/confirm", { code });
    setAccessToken(res.accessToken);
  },
  forgetDevices: () => http.post<{ forgotten: number }>("/api/admin/account/devices/forget"),
};

// ---- «Админы» (SUPER_ADMIN only, /api/admin/admins/**) ----------------------

export type AdminRoleCode = "ADMIN" | "SUPER_ADMIN";
export type InviteKind = "NEW" | "CREDENTIALS" | "PASSWORD_RESET";

export interface TeamInvite {
  id: number;
  kind: InviteKind;
  telegramUserId: number;
  name: string | null;
  role: AdminRoleCode;
  createdAt: string;
  expiresAt: string;
  /** The bot delivered the link (otherwise the super admin handed it over). */
  delivered: boolean;
  invitedByName: string | null;
  /** «@username · Имя» from the shop's users, when known. */
  telegramLabel: string | null;
}

export interface TeamAdmin {
  telegramUserId: number;
  name: string | null;
  username: string | null;
  role: AdminRoleCode;
  status: "SUPER_ADMIN" | "ADMIN" | "BLOCKED";
  active: boolean;
  totpEnabled: boolean;
  passwordSet: boolean;
  createdAt: string | null;
  lastLogin: { at: string; city: string | null; country: string | null; method: string } | null;
  trustedDevices: number;
  /** Locked for wrong passwords / codes until then (stage 1 lockout), or null. */
  lockedUntil: string | null;
  /** Open login / password link of this admin. */
  invite: TeamInvite | null;
  telegramLabel: string | null;
  /** The caller — managed in «Мой аккаунт», not here. */
  self: boolean;
}

export interface Team {
  admins: TeamAdmin[];
  /** Open invites of NEW admins (no account yet). */
  invites: TeamInvite[];
}

/** A new invite link; `link`/`path` only when the bot could NOT deliver it. */
export interface InviteCreated {
  inviteId: number;
  kind: InviteKind;
  delivered: boolean;
  link?: string;
  path?: string;
  expiresAt: string;
}

export const teamApi = {
  list: () => http.get<Team>("/api/admin/admins"),
  invite: (body: { telegramUserId: number; name?: string; role?: AdminRoleCode; code: string }) =>
    http.post<InviteCreated>("/api/admin/admins/invites", body),
  resendInvite: (id: number) => http.post<InviteCreated>(`/api/admin/admins/invites/${id}/resend`),
  revokeInvite: (id: number) => http.del<void>(`/api/admin/admins/invites/${id}`),
  update: (id: number, body: { name?: string; role?: AdminRoleCode; code?: string }) =>
    http.patch<void>(`/api/admin/admins/${id}`, body),
  resetTwoFactor: (id: number, code: string) => http.post<void>(`/api/admin/admins/${id}/reset-2fa`, { code }),
  resetPassword: (id: number, code: string) => http.post<InviteCreated>(`/api/admin/admins/${id}/reset-password`, { code }),
  forgetDevices: (id: number) => http.post<{ forgotten: number }>(`/api/admin/admins/${id}/forget-devices`),
  block: (id: number, code: string) => http.post<void>(`/api/admin/admins/${id}/block`, { code }),
  unblock: (id: number, code: string) => http.post<void>(`/api/admin/admins/${id}/unblock`, { code }),
  remove: (id: number, code: string) => http.post<void>(`/api/admin/admins/${id}/delete`, { code }),
};

/** The full invite URL to hand over: the backend's absolute link, or this admin's origin + path. */
export function inviteUrl(c: InviteCreated): string | null {
  if (c.link) return c.link;
  if (c.path && typeof window !== "undefined") return `${window.location.origin}${c.path}`;
  return null;
}

// ---- public /invite/<token> (no sign-in) -------------------------------------

export interface InviteInfo {
  kind: InviteKind;
  name: string | null;
  /** «админ» / «главный админ». */
  role: string;
  /** Fixed login (password reset), or null when the person chooses one. */
  username: string | null;
  loginEditable: boolean;
  /** true: a new authenticator entry is set up; false: the current code is asked. */
  twoFactorSetup: boolean;
  expiresAt: string;
}

export interface InviteAccepted {
  next: "SETUP" | "VERIFY";
  setup?: TwoFactorSetup;
}

export const inviteApi = {
  check: (token: string) => http.post<InviteInfo>("/api/auth/admin/invite/check", { token }),
  accept: (token: string, username: string, password: string) =>
    http.post<InviteAccepted>("/api/auth/admin/invite/accept", { token, username, password }),
  /** Burns the link, activates the account and signs in (the token is stored). */
  async complete(token: string, code: string, trustDevice: boolean): Promise<AdminLoginResult> {
    return signedIn(await http.post<AdminLoginResult>("/api/auth/admin/invite/complete", { token, code, trustDevice }));
  },
};

// ============================================================================
// Admin-only payloads
// ============================================================================

export interface BoardDto {
  /** Cards per status, capped at 300 per column on the backend. */
  columns: Record<OrderStatus, OrderCardDto[]>;
  /** REAL total per status within the current range+q filter (may exceed columns length). */
  counts: Record<OrderStatus, number>;
}

export interface DispatchItem {
  title: string;
  variantName?: string | null;
  quantity: number;
  priceMinor: number;
}

/**
 * Seller dispatch row for an APPROVED order: what to ship and how much cash to collect.
 * `receivedMinor` is what actually arrived (online via monobank, or recorded by an admin).
 */
export interface DispatchOrder {
  id: string;
  shortId: string;
  customerName: string;
  phone: string;
  deliveryMethod: DeliveryMethod;
  npCityName?: string | null;
  npWarehouseName?: string | null;
  items: DispatchItem[];
  totalMinor: number;
  prepaymentMinor: number;
  receivedMinor: number;
  codMinor: number;
  paid: boolean;
  /** Online payment deadline — for «Ждёт оплаты» on the card (optional: older backends omit it). */
  paymentDueAt?: string | null;
  amountDueMinor?: number;
  currency: string;
  paymentOptionTitle?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
  approvedAt?: string | null;
}

export type OrderSortBy = "createdAt" | "totalMinor" | "customerName" | "status";
export type SortDir = "asc" | "desc";

export interface ProductWriteRequest {
  title: string;
  description?: string;
  priceMinor: number;
  currency: string;
  /** Omitted = keep the stored stock (the admin did not touch it; orders may have moved it). */
  stock?: number;
  /** Stock the form was opened with; a changed `stock` over a moved value -> 409 STOCK_CONFLICT. */
  expectedStock?: number;
  active: boolean;
  imageKeys: string[];
  /** Leaf category; required for new products. null = keep, "" = none. */
  categoryId?: string | null;
  /** Existing brand; "" clears, null keeps. Omitted with brandName = find or create by name/alias. */
  brandId?: string | null;
  brandName?: string;
  condition?: ProductCondition;
  /** "" clears. */
  conditionNote?: string;
  /** The whole specs object (keys missing = unknown). */
  specs?: ProductSpecs;
  cardStatus?: CardStatus;
  /**
   * Existing variants MUST carry their id: without it the server can only match by name, and a
   * rename would delete the row and create a new one — which used to invalidate customers'
   * saved carts and the variant reference on past orders.
   */
  variants: { id?: string; name: string; stock?: number; expectedStock?: number }[];
  /** Public site. Blank slug = generate from the title; omitted fields keep their value. */
  slug?: string;
  /** "Старая цена" (minor units); 0 clears it. */
  compareAtMinor?: number;
  seoTitle?: string;
  seoDescription?: string;
  /** Unique among products; "" clears; omitted keeps. A taken one -> 400. */
  sku?: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountPercent?: number | null;
  discountAmountMinor?: number | null;
  maxUses?: number | null;
  /** How many orders used the code (backend `usesCount`). */
  usesCount?: number | null;
  active: boolean;
}

export interface PaymentOption {
  id?: string;
  title: string;
  description?: string;
  requiresPrepayment: boolean;
  prepaymentMinor?: number | null;
}

/** Outcome of the public site's on-demand rebuild (GET /api/admin/site/revalidate/status). */
export interface SiteRevalidateStatus {
  /** False when SITE_REVALIDATE_URL is not configured. */
  enabled: boolean;
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
}

/** One row of the admin action log (GET /api/admin/audit). */
export interface AuditEntry {
  id: number;
  adminId: number;
  adminName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

// ---- users -----------------------------------------------------------------
export interface UserCardDto {
  telegramUserId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  premium: boolean;
  botBlocked: boolean;
  ordersCount: number;
  totalSpentMinor: number;
  createdAt?: string | null;
  lastSeenAt?: string | null;
}

export type UserSortBy =
  | "createdAt"
  | "lastSeenAt"
  | "username"
  | "telegramUserId"
  | "ordersCount"
  | "totalSpentMinor";

export interface UserMetricsDto {
  range: TimeRange;
  currency: string;
  totalUsers: number;
  newUsersInRange: number;
  activeUsers: number;
  inactiveUsers: number;
  blockedUsers: number;
  premiumUsers: number;
  newUsersByDay: { date: string; count: number }[];
  languages: { language: string; count: number }[];
  topCustomers: {
    telegramUserId: number;
    name: string;
    ordersCount: number;
    totalSpentMinor: number;
  }[];
}

// ---- broadcasts ------------------------------------------------------------
export type BroadcastAudience = "all" | "active" | "inactive" | "premium";

export interface BroadcastStatus {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface BroadcastResult {
  ok: boolean;
  detail: string;
}

// ---- content translations (docs/CONTENT-I18N.md) ---------------------------
export type TrLocale = "uk" | "en";
export type TrEntityType = "PRODUCT" | "VARIANT" | "CATEGORY" | "PAYMENT_OPTION" | "REPLY_TEMPLATE";
export type TrStatus = "TRANSLATED" | "STALE" | "MISSING";
export type TrOrigin = "AI" | "MANUAL";

/** One translatable field of one language (GET /api/admin/translations/export). */
export interface TrExportItem {
  entityType: TrEntityType;
  entityId: string;
  field: string;
  /** Russian source as stored (the source of truth). */
  source: string;
  /** SHA-256 hex of `source` — a translation applies only while this matches. */
  sourceHash: string;
  status: TrStatus;
  /** Current translation (outdated one for STALE), null for MISSING. */
  text: string | null;
  origin: TrOrigin | null;
  /**
   * Owning product of PRODUCT/VARIANT fields; null for payment options and tag names. For the SEO
   * fields of a CATEGORY `productTitle` holds the category name (context; `productId` stays null).
   */
  productId: string | null;
  productTitle: string | null;
}

export interface TrImportItem {
  entityType: string;
  entityId: string;
  field: string;
  sourceHash: string;
  text: string;
}

export interface TrRejected {
  entityType: string | null;
  entityId: string | null;
  field: string | null;
  /** INVALID_* | NOT_FOUND | NO_SOURCE | STALE | MANUAL */
  reason: string;
}

export interface TrImportResult {
  applied: number;
  skippedStale: number;
  skippedManual: number;
  notFound: number;
  invalid: number;
  rejected: TrRejected[];
}

export interface TrCounts {
  translated: number;
  stale: number;
  missing: number;
}

/** locale → entity type (+ "ALL") → counts. */
export interface TrStats {
  locales: Record<TrLocale, Record<TrEntityType | "ALL", TrCounts>>;
}

export interface TrSourceFixResult {
  updated: number;
  skippedStale: number;
  notFound: number;
  invalid: number;
  translationsApplied: number;
  sourceHash: string;
  rejected: TrRejected[];
}

// ============================================================================
// Admin API endpoints
// ============================================================================

export const adminApi = {
  // ---- dispatch (seller shipping list) ----
  /** GET /api/admin/orders/dispatch -> approved orders with COD amounts. */
  dispatch: () => apiGet<DispatchOrder[]>("/api/admin/orders/dispatch"),
  /** POST /api/admin/orders/dispatch/broadcast -> post the list to the seller Telegram topic. */
  dispatchBroadcast: () =>
    apiPost<{ posted: number }>("/api/admin/orders/dispatch/broadcast"),

  // ---- orders / board ----
  /** GET /api/admin/orders/board?q=&range= -> { columns } filtered. */
  board: (params: { q?: string; range?: TimeRange } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.range) sp.set("range", params.range);
    const qs = sp.toString();
    return apiGet<BoardDto>(`/api/admin/orders/board${qs ? `?${qs}` : ""}`);
  },
  /** GET /api/admin/orders -> PLAIN OrderCardDto[] (not paged). */
  orders: (params: {
    status?: string;
    q?: string;
    range?: TimeRange;
    page?: number;
    size?: number;
    sortBy?: OrderSortBy;
    sortDir?: SortDir;
  }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.q) sp.set("q", params.q);
    if (params.range) sp.set("range", params.range);
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 20));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    return apiGet<OrderCardDto[]>(`/api/admin/orders?${sp.toString()}`);
  },
  order: (id: string) => apiGet<OrderDetailDto>(`/api/admin/orders/${id}`),
  changeStatus: (
    id: string,
    body: { status: OrderStatus; trackingNumber?: string; rejectReason?: string; restock?: boolean }
  ) => apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/status`, body),
  /**
   * PATCH /api/admin/orders/{id}/paid { receivedMinor } -> updated OrderDetailDto. 0 clears payment.
   * A manual correction (cash on delivery, a mistake); online payments are credited by monobank.
   */
  setPaid: (id: string, receivedMinor: number) =>
    apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/paid`, { receivedMinor }),

  // ---- online payment (monobank) ----
  /** GET /api/admin/orders/{id}/payments -> the order's invoices, newest first. */
  getOrderPayments: (id: string) => apiGet<AdminInvoice[]>(`/api/admin/orders/${id}/payments`),
  /** POST /api/admin/orders/{id}/payments/refresh -> asks monobank for the current state. */
  refreshOrderPayments: (id: string) =>
    apiPost<AdminInvoice[]>(`/api/admin/orders/${id}/payments/refresh`),
  /**
   * POST /api/admin/orders/{id}/payments/{invoiceId}/refund -> money back to the card.
   * `amountMinor` omitted = everything left on that invoice. Settles asynchronously
   * (`refundPending` until monobank confirms).
   */
  refundOrderPayment: (id: string, invoiceId: string, amountMinor?: number) =>
    apiPost<AdminInvoice[]>(
      `/api/admin/orders/${id}/payments/${encodeURIComponent(invoiceId)}/refund`,
      amountMinor === undefined ? {} : { amountMinor }
    ),
  /**
   * GET /api/admin/orders/{id}/receipts -> fiscal checks (sale / return) + the bank receipt of every
   * paid invoice; `downloadUrl` is a signed, server-relative link valid ~10 min (see {@link receiptHref}).
   */
  getOrderReceipts: (id: string) => apiGet<Receipt[]>(`/api/admin/orders/${id}/receipts`),
  /** GET /api/admin/payments/monobank/status -> token configured, merchant, last webhook. */
  getMonobankStatus: () => apiGet<MonobankStatus>("/api/admin/payments/monobank/status"),
  /** Add a product line to the order (paid, or gift when gift=true). */
  addOrderItem: (
    id: string,
    body: { productId: string; variantId?: string; quantity?: number; gift?: boolean; notifyCustomer?: boolean }
  ) => apiPost<OrderDetailDto>(`/api/admin/orders/${id}/items`, body),
  /** Change an order item's quantity (reserves/releases stock). */
  changeOrderItemQty: (
    id: string,
    itemId: number,
    body: { quantity: number; notifyCustomer?: boolean }
  ) => apiPatch<OrderDetailDto>(`/api/admin/orders/${id}/items/${itemId}`, body),
  /** Remove an order item (gift/line), restoring its stock. */
  removeOrderItem: (id: string, itemId: number) =>
    apiDelete<OrderDetailDto>(`/api/admin/orders/${id}/items/${itemId}`),
  /** Apply/update/remove a discount: promo code, or manual amount/percent, or clear. */
  applyOrderDiscount: (
    id: string,
    body: { promoCode?: string; amountMinor?: number; percent?: number; clear?: boolean; notifyCustomer?: boolean }
  ) => apiPost<OrderDetailDto>(`/api/admin/orders/${id}/discount`, body),
  /**
   * Hard delete — DELIVERED / REJECTED only (400 otherwise). A delivered order's stock stays as is
   * (the goods are with the customer) unless `restock: true`; the promo use is released, chat files are removed.
   */
  deleteOrder: (id: string, opts: { restock?: boolean } = {}) =>
    apiDelete<void>(`/api/admin/orders/${id}${opts.restock === true ? "?restock=true" : ""}`),

  /** GET /api/admin/orders/unread-count -> total unread messages across orders. */
  unreadCount: () => apiGet<{ count: number }>("/api/admin/orders/unread-count"),
  /** POST /api/admin/orders/read-all -> mark all customer messages read. */
  markAllRead: () => apiPost<{ marked: number }>("/api/admin/orders/read-all"),

  // ---- order chat ----
  /** A page of chat history, oldest-first; `before` walks further back. */
  messages: (id: string, before?: number) =>
    apiGet<MessageDto[]>(
      `/api/admin/orders/${id}/messages${before ? `?before=${before}` : ""}`
    ),
  sendMessage: (id: string, body: SendMessageRequest) =>
    apiPost<MessageDto>(`/api/admin/orders/${id}/messages`, body),
  markRead: (id: string) =>
    apiPost<void>(`/api/admin/orders/${id}/messages/read`),
  /** Chat attachment (image or PDF) -> { key }: stored privately under chat/, not with product photos. */
  uploadChatAttachment: (id: string, file: File) =>
    uploadFile(`/api/admin/orders/${id}/attachments`, file),

  // ---- products ----
  products: () => apiGet<AdminProduct[]>("/api/admin/products"),
  productsArchived: () => apiGet<AdminProduct[]>("/api/admin/products/archived"),
  createProduct: (body: ProductWriteRequest) =>
    apiPost<AdminProductSaved>("/api/admin/products", body),
  /** `force`: publish (active=true) a card that is not completed yet (409 CARD_NOT_READY otherwise). */
  updateProduct: (id: string, body: ProductWriteRequest, force = false) =>
    apiPatch<AdminProductSaved>(`/api/admin/products/${id}${force ? "?force=1" : ""}`, body),
  /** «Отметить проверенной» / «Вернуть в черновик». */
  setCardStatus: (id: string, status: CardStatus) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/card-status`, { status }),
  /**
   * Turning a DRAFT card on → 409 CARD_NOT_READY (unless `force`); no price / category →
   * 409 PRODUCT_NOT_PUBLISHABLE.
   */
  setProductActive: (id: string, active: boolean, force = false) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/active${force ? "?force=1" : ""}`, { active }),
  setProductArchived: (id: string, archived: boolean) =>
    apiPatch<AdminProduct>(`/api/admin/products/${id}/archived`, { archived }),
  upload: (file: File) => uploadFile("/api/admin/uploads", file),

  // ---- categories (tree as a flat list) ----
  categories: async () => (await apiGet<unknown[]>("/api/admin/categories")).map(normCategory),
  createCategory: async (body: CategoryWriteRequest) =>
    normCategory(await apiPost<unknown>("/api/admin/categories", body)),
  updateCategory: async (id: string, body: CategoryWriteRequest) =>
    normCategory(await apiPatch<unknown>(`/api/admin/categories/${id}`, body)),
  /** 409 CATEGORY_HAS_PRODUCTS / CATEGORY_HAS_CHILDREN. */
  deleteCategory: (id: string) => apiDelete<void>(`/api/admin/categories/${id}`),
  reorderCategories: (rows: CategoryReorderItem[]) => apiPatch<unknown>("/api/admin/categories/reorder", rows),

  // ---- brands ----
  brands: async () => (await apiGet<unknown[]>("/api/admin/brands")).map(normBrand),
  createBrand: async (body: BrandWriteRequest) => normBrand(await apiPost<unknown>("/api/admin/brands", body)),
  updateBrand: async (id: string, body: BrandWriteRequest) =>
    normBrand(await apiPatch<unknown>(`/api/admin/brands/${id}`, body)),
  /** Products of the brand stay, without a brand. */
  deleteBrand: (id: string) => apiDelete<void>(`/api/admin/brands/${id}`),
  /** Products and aliases of `id` move to `targetId`; `id` is deleted. */
  mergeBrand: (id: string, targetId: string) => apiPost<unknown>(`/api/admin/brands/${id}/merge-into/${targetId}`),

  // ---- characteristics ----
  /** Own + inherited (parents, global) attributes of a category; no id = the global ones. */
  specAttributes: async (categoryId?: string | null) =>
    (
      await apiGet<unknown[]>(
        `/api/admin/spec-attributes${categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""}`
      )
    ).map(normAttribute),
  createSpecAttribute: async (body: SpecAttributeWriteRequest) =>
    normAttribute(await apiPost<unknown>("/api/admin/spec-attributes", attributeBody(body))),
  /** Options are replaced as a whole; dropping a used option → 409 without `force`. */
  updateSpecAttribute: async (id: string, body: Partial<SpecAttributeWriteRequest>, force = false) =>
    normAttribute(
      await apiPatch<unknown>(`/api/admin/spec-attributes/${id}${force ? "?force=1" : ""}`, attributeBody(body))
    ),
  /** In use → 409 ATTRIBUTE_IN_USE {count}; `force` also removes the key from product specs. */
  deleteSpecAttribute: (id: string, force = false) =>
    apiDelete<void>(`/api/admin/spec-attributes/${id}${force ? "?force=1" : ""}`),
  /** Rewrites product specs from one option value to another («объединить с…»). */
  renameSpecOption: (id: string, from: string, to: string) =>
    apiPost<unknown>(`/api/admin/spec-attributes/${id}/rename-option`, { from, to }),
  specGroups: async () => (await apiGet<unknown[]>("/api/admin/spec-groups")).map((g, i) => normGroup(g, i)),
  putSpecGroups: async (groups: AdminSpecGroup[]) =>
    (
      await apiPut<unknown[]>(
        "/api/admin/spec-groups",
        groups.map(({ sortOrder, ...g }) => ({ ...g, sort: sortOrder }))
      )
    ).map((g, i) => normGroup(g, i)),
  catalogSchema: async (): Promise<AdminCatalogSchema> => {
    const r = ((await apiGet<unknown>("/api/admin/catalog/schema")) ?? {}) as Loose;
    const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
    let attributes = arr(r.attributes).map(normAttribute);
    // A nested answer (attributes inside their categories, globals apart) is flattened.
    if (attributes.length === 0) {
      attributes = [
        ...arr(pick(r, "globalAttributes", "global_attributes")).map((a) => ({ ...normAttribute(a), categoryId: null })),
        ...arr(r.categories).flatMap((c) =>
          arr((c as Loose).attributes).map((a) => ({ ...normAttribute(a), categoryId: str((c as Loose).id) || null }))
        ),
      ];
    }
    // The import format names the parent by slug.
    const rawCats = arr(r.categories) as Loose[];
    const idBySlug = new Map(rawCats.map((c) => [str(c.slug), str(c.id)]));
    return {
      categories: rawCats.map((c) => {
        const n = normCategory(c);
        const parentSlug = typeof c.parent === "string" ? c.parent : null;
        return n.parentId || !parentSlug ? n : { ...n, parentId: idBySlug.get(parentSlug) ?? null };
      }),
      brands: arr(r.brands).map(normBrand),
      groups: arr(r.groups).map((g, i) => normGroup(g, i)),
      attributes,
    };
  },

  // ---- promocodes ----
  promocodes: () => apiGet<PromoCode[]>("/api/admin/promocodes"),
  createPromo: (body: Partial<PromoCode>) =>
    apiPost<PromoCode>("/api/admin/promocodes", body),
  updatePromo: (id: string, body: Partial<PromoCode>) =>
    apiPatch<PromoCode>(`/api/admin/promocodes/${id}`, body),
  deletePromo: (id: string) => apiDelete<void>(`/api/admin/promocodes/${id}`),

  // ---- users ----
  /** GET /api/admin/users -> PLAIN UserCardDto[] (not paged). */
  users: (params: {
    q?: string;
    blockedOnly?: boolean;
    page?: number;
    size?: number;
    sortBy?: UserSortBy;
    sortDir?: SortDir;
  }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.blockedOnly) sp.set("blockedOnly", "true");
    sp.set("page", String(params.page ?? 0));
    sp.set("size", String(params.size ?? 30));
    if (params.sortBy) sp.set("sortBy", params.sortBy);
    if (params.sortDir) sp.set("sortDir", params.sortDir);
    return apiGet<UserCardDto[]>(`/api/admin/users?${sp.toString()}`);
  },
  /** GET /api/admin/users/metrics?range= -> UserMetricsDto. */
  userMetrics: (range: TimeRange = "month") =>
    apiGet<UserMetricsDto>(`/api/admin/users/metrics?range=${range}`),
  /** GET /api/admin/orders/by-user/{tgId} -> all orders of that user (newest first). */
  userOrders: (telegramUserId: number) =>
    apiGet<OrderCardDto[]>(`/api/admin/orders/by-user/${telegramUserId}`),

  // ---- broadcasts ----
  broadcastAudiences: () =>
    apiGet<Record<BroadcastAudience, number>>("/api/admin/broadcast/audiences"),
  broadcastStatus: () => apiGet<BroadcastStatus>("/api/admin/broadcast/status"),
  broadcast: (body: {
    text: string;
    audience: BroadcastAudience;
    withButton?: boolean;
    buttonText?: string;
  }) => apiPost<BroadcastStatus>("/api/admin/broadcast", body),
  broadcastTest: (body: {
    text: string;
    telegramUserId: number;
    withButton?: boolean;
    buttonText?: string;
  }) => apiPost<BroadcastResult>("/api/admin/broadcast/test", body),

  // ---- audit log ----
  /** GET /api/admin/audit -> recent admin actions (newest first). */
  audit: (page = 0, size = 50) =>
    apiGet<AuditEntry[]>(`/api/admin/audit?page=${page}&size=${size}`),

  // ---- content translations ----
  translationsExport: (locale: TrLocale, status: "missing" | "stale" | "translated" | "all" = "all") =>
    apiGet<TrExportItem[]>(`/api/admin/translations/export?locale=${locale}&status=${status}`),
  translationsStats: () => apiGet<TrStats>("/api/admin/translations/stats"),
  translationsImport: (body: {
    locale: TrLocale;
    origin: TrOrigin;
    force?: boolean;
    items: TrImportItem[];
  }) => apiPut<TrImportResult>("/api/admin/translations/import", body),
  /** Reset one field of one language (the Russian original is shown again). */
  translationsReset: (locale: TrLocale, entityType: string, entityId: string, field: string) =>
    apiDelete<{ deleted: number }>(
      `/api/admin/translations?locale=${locale}&entityType=${entityType}&entityId=${entityId}&field=${encodeURIComponent(field)}`
    ),
  /** Proofreading: replace the Russian source (optimistic by sourceHash) + write uk/en of the new text. */
  translationsSourceFix: (body: {
    items: { entityType: string; entityId: string; field: string; sourceHash: string }[];
    source: string;
    translations: Partial<Record<TrLocale, string>>;
  }) => apiPut<TrSourceFixResult>("/api/admin/translations/source-fix", body),

  // ---- public site ----
  /** POST /api/admin/site/revalidate -> rebuild every page now; `error` is null on success. */
  siteRevalidate: () =>
    apiPost<{ ok: boolean; error?: string | null; status: SiteRevalidateStatus }>(
      "/api/admin/site/revalidate"
    ),

  // ---- payment settings ----
  paymentOptions: () => apiGet<PaymentOption[]>("/api/admin/payment-options"),
  putPaymentOptions: (list: PaymentOption[]) =>
    apiPut<PaymentOption[]>("/api/admin/payment-options", list),
};
