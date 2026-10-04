/**
 * Direct backend calls for the specs: preparing a "parallel" change (another admin, an order
 * placed meanwhile) and checking what the UI actually saved. Uses the token from global setup.
 */
import fs from "node:fs";
import path from "node:path";
import { request, type APIRequestContext } from "@playwright/test";
import { API_URL, E2E_DIR } from "../env.js";

export const AUTH_DIR = path.join(E2E_DIR, ".auth");
export const TOKEN_FILE = path.join(AUTH_DIR, "token.json");
export const STORAGE_FILE = path.join(AUTH_DIR, "admin.json");

export function savedToken(): string {
  return (JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")) as { token: string }).token;
}

/** Minimal shapes of what the specs read back. */
export interface OrderDetail {
  id: string;
  status: string;
  trackingNumber: string | null;
  rejectReasonCode?: string | null;
  totalMinor: number;
  receivedMinor: number;
  refundedMinor?: number;
  paid: boolean;
  items: { id: number; title: string; quantity: number; returnedQty?: number }[];
}

export interface AdminProduct {
  id: string;
  title: string;
  description: string | null;
  priceMinor: number;
  currency: string;
  stock: number;
  active: boolean;
  slug?: string;
  variants?: { id: string; name: string; stock: number }[];
  tags?: { id: string }[];
  images?: { key?: string; url?: string }[];
}

export interface InboxGroup {
  id: string;
  title: string;
  count: number;
  dismissible: boolean;
  items: { key: string; type: string; entityId: string; version: string; shortId?: string | null }[];
}
export interface Inbox {
  total: number;
  groups: InboxGroup[];
}

export interface Board {
  columns: Record<string, { id: string; totalMinor: number }[]>;
  counts: Record<string, number>;
  sums?: Record<string, number>;
}

export class Api {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(token = savedToken()): Promise<Api> {
    const ctx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    return new Api(ctx);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async json<T>(method: "get" | "post" | "put" | "patch" | "delete", url: string, data?: unknown): Promise<T> {
    const res = await this.ctx[method](url, data === undefined ? undefined : { data });
    if (!res.ok()) {
      throw new Error(`${method.toUpperCase()} ${url} → ${res.status()}: ${await res.text()}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Raw response, for asserting on a refusal (status + error body). */
  async raw(method: "get" | "post" | "put" | "patch" | "delete", url: string, data?: unknown) {
    const res = await this.ctx[method](url, data === undefined ? undefined : { data });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { text };
    }
    return { status: res.status(), body };
  }

  order(id: string) {
    return this.json<OrderDetail>("get", `/api/admin/orders/${id}`);
  }

  board(range = "month") {
    return this.json<Board>("get", `/api/admin/orders/board?range=${range}&closedLimit=20`);
  }

  changeStatus(id: string, body: Record<string, unknown>) {
    return this.json<OrderDetail>("patch", `/api/admin/orders/${id}/status`, body);
  }

  inbox() {
    return this.json<Inbox>("get", "/api/admin/inbox");
  }

  inboxRestore(type: string, entityId: string) {
    return this.json<void>("post", "/api/admin/inbox/restore", { type, entityId });
  }

  messages(orderId: string) {
    return this.json<{ id: number; senderType: string; text: string | null; readAt: string | null }[]>(
      "get",
      `/api/admin/orders/${orderId}/messages`
    );
  }

  async product(id: string): Promise<AdminProduct> {
    const all = await this.json<AdminProduct[]>("get", "/api/admin/products");
    const p = all.find((x) => x.id === id);
    if (!p) throw new Error(`product ${id} not found`);
    return p;
  }

  /**
   * Stock change the way another admin's save (or an order) would make it: the full product body
   * the admin form sends, with a new stock and no expectedStock.
   */
  async setProductStock(id: string, stock: number): Promise<AdminProduct> {
    const p = await this.product(id);
    return this.json<AdminProduct>("patch", `/api/admin/products/${id}`, {
      title: p.title,
      description: p.description ?? undefined,
      priceMinor: p.priceMinor,
      currency: p.currency,
      stock,
      active: p.active,
    });
  }

  settings() {
    return this.json<{ items: { key: string; value: unknown; defaultValue: unknown; overridden: boolean }[] }>(
      "get",
      "/api/admin/settings"
    );
  }

  audit(params = "") {
    return this.json<{ id: number; action: string; entityType: string; entityId: string | null; details: string | null }[]>(
      "get",
      `/api/admin/audit?page=0&size=50${params}`
    );
  }
}
