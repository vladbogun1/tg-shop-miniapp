/**
 * The fetch wrapper both apps use.
 *
 * <p>They each had their own near-identical copy, so a fix to error handling only ever landed in
 * one of them. The differences that actually matter — where the token lives, and what to do on a
 * 401 — are injected instead of forked.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface HttpClientOptions {
  /** Origin WITHOUT a trailing /api — request paths already start with "/api/...". */
  baseUrl: string;
  /** Current bearer token, or null when unauthenticated. */
  getToken: () => string | null;
  /** Called on 401/403 so the app can drop the session and show a login screen. */
  onUnauthorized?: (status: number) => void;
}

export interface HttpClient {
  readonly baseUrl: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
  upload<T>(path: string, file: File): Promise<T>;
  /** Turns a server-relative path (e.g. a signed /api/media link) into an absolute URL. */
  absolute(path: string | null | undefined): string | null;
}

/** Strips a trailing slash and a trailing "/api" so "host/api" never yields "/api/api/...". */
export function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return (raw ?? fallback).replace(/\/$/, "").replace(/\/api$/, "");
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { baseUrl, getToken, onUnauthorized } = options;

  async function request<T>(
    path: string,
    init: RequestInit = {},
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const isFormData = init.body instanceof FormData;
    if (init.body && !isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (extraHeaders) {
      for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
    }

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      // Network error / backend offline — status 0 lets callers tell it apart from an HTTP error.
      throw new ApiError("Не удалось связаться с сервером", 0);
    }

    if (res.status === 401 || res.status === 403) {
      onUnauthorized?.(res.status);
      throw new ApiError(await messageOf(res, "Сессия истекла, войдите снова"), res.status);
    }
    if (!res.ok) {
      throw new ApiError(await messageOf(res, `Ошибка ${res.status}`), res.status);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  async function messageOf(res: Response, fallback: string): Promise<string> {
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      return data.message || data.error || fallback;
    } catch {
      return fallback;
    }
  }

  return {
    baseUrl,
    get: <T,>(path: string) => request<T>(path, { method: "GET" }),
    post: <T,>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>(
        path,
        { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) },
        headers
      ),
    patch: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "PATCH",
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    put: <T,>(path: string, body?: unknown) =>
      request<T>(path, {
        method: "PUT",
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
    upload: <T,>(path: string, file: File) => {
      const form = new FormData();
      form.append("file", file);
      // Content-Type is intentionally not set: the browser adds the multipart boundary.
      return request<T>(path, { method: "POST", body: form });
    },
    absolute: (path) => {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      if (path.startsWith("/")) return `${baseUrl}${path}`;
      return path;
    },
  };
}

/**
 * A key that makes a retried checkout safe: the server returns the order it already created for
 * this key instead of placing a second one. Generated per checkout attempt, not per request.
 */
export function newIdempotencyKey(): string {
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
