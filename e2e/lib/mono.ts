/**
 * Control client of the fake monobank (lib/fake-mono.mjs): move an invoice to a state and send the signed
 * webhook, make the bank fail, read what the backend asked of it.
 */
import { request, type APIRequestContext } from "@playwright/test";
import { FAKE_MONO_URL } from "../env.js";

export interface BankRequest {
  method: string;
  path: string;
  invoiceId?: string;
  body: Record<string, unknown>;
}

export class FakeMono {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(): Promise<FakeMono> {
    return new FakeMono(await request.newContext({ baseURL: FAKE_MONO_URL }));
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async call<T>(method: "get" | "post", url: string, data?: unknown): Promise<T> {
    const res = await this.ctx[method](url, { data, timeout: 30_000 });
    if (!res.ok()) throw new Error(`fake-mono ${method.toUpperCase()} ${url} → ${res.status()}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Forgets the recorded requests and the failure rules. */
  reset() {
    return this.call<object>("post", "/__e2e/reset");
  }

  /** The bank moves the invoice to `status` and posts the (signed unless `sign: false`) webhook; answers the backend's HTTP status. */
  async webhook(invoiceId: string, opts: { status?: string; sign?: boolean } = {}): Promise<number> {
    return (await this.call<{ sent: number }>("post", "/__e2e/webhook", { invoiceId, ...opts })).sent;
  }

  /** The bank misbehaves for the requests that match `path` (tail) and / or `invoiceId`. */
  fail(mode: "500" | "timeout", match: { path?: string; invoiceId?: string; hangMs?: number } = {}) {
    return this.call<object>("post", "/__e2e/fail", { mode, ...match });
  }

  requests(pathTail?: string): Promise<BankRequest[]> {
    return this.call<BankRequest[]>("get", `/__e2e/requests${pathTail ? `?path=${encodeURIComponent(pathTail)}` : ""}`);
  }

  /** The refund (cancel) requests made for this invoice. */
  async cancels(invoiceId: string): Promise<BankRequest[]> {
    return (await this.requests("/invoice/cancel")).filter((r) => r.invoiceId === invoiceId);
  }
}
