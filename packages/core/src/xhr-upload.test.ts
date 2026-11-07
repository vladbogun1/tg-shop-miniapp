import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpClient, UPLOAD_TIMEOUT_MS } from "./http";

/** A stand-in for the browser's XMLHttpRequest: the test drives the upload events and the answer by hand. */
class FakeXhr {
  static last: FakeXhr | null = null;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  withCredentials = false;
  timeout = 0;
  status = 0;
  responseText = "";
  body: unknown = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v;
  }
  send(body: unknown) {
    this.body = body;
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  answer(status: number, text: string) {
    this.upload.onload?.();
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

const file = () => new File([new Uint8Array(100)], "invoice.jpg", { type: "image/jpeg" });

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXhr.last = null;
});

describe("upload with progress (XHR)", () => {
  it("reports the share sent and returns the JSON answer, with the token and the language", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const seen: number[] = [];
    const http = createHttpClient({ baseUrl: "http://x", getToken: () => "tok", getLocale: () => "ru" });
    const p = http.upload<{ id: number }[]>("/api/admin/ai/files", file(), (s) => seen.push(s));
    const xhr = FakeXhr.last!;
    expect([xhr.method, xhr.url, xhr.timeout]).toEqual(["POST", "http://x/api/admin/ai/files", UPLOAD_TIMEOUT_MS]);
    expect(xhr.headers.authorization).toBe("Bearer tok");
    expect(xhr.headers["accept-language"]).toBe("ru");
    // the browser sets the multipart boundary itself
    expect(xhr.headers["content-type"]).toBeUndefined();
    expect(xhr.body).toBeInstanceOf(FormData);
    xhr.progress(25, 100);
    xhr.progress(80, 100);
    xhr.answer(200, '[{"id":5}]');
    await expect(p).resolves.toEqual([{ id: 5 }]);
    expect(seen).toEqual([0.25, 0.8, 1]);
  });

  it("an error answer is the same ApiError as with fetch: message, code and params from the body", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const http = createHttpClient({ baseUrl: "http://x", getToken: () => null });
    const p = http.upload("/api/admin/ai/files", file(), () => undefined);
    FakeXhr.last!.answer(409, JSON.stringify({ message: "Не больше 10 картинок", code: "AI_FILES_LIMIT", params: { max: 10 } }));
    await expect(p).rejects.toMatchObject({ name: "ApiError", status: 409, message: "Не больше 10 картинок", code: "AI_FILES_LIMIT" });
  });

  it("403 goes to onUnauthorized with its code, like any other request", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const onUnauthorized = vi.fn();
    const http = createHttpClient({ baseUrl: "http://x", getToken: () => "t", onUnauthorized });
    const p = http.upload("/api/x", file(), () => undefined);
    FakeXhr.last!.answer(403, JSON.stringify({ message: "Нет доступа", code: "FINANCE_ACCESS_DENIED" }));
    await expect(p).rejects.toMatchObject({ status: 403 });
    expect(onUnauthorized).toHaveBeenCalledWith(403, "FINANCE_ACCESS_DENIED");
  });

  it("no network and a timeout are the offline error (status 0)", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const http = createHttpClient({ baseUrl: "http://x", getToken: () => null, messages: { offline: () => "OFFLINE" } });
    const a = http.upload("/api/x", file(), () => undefined);
    FakeXhr.last!.onerror?.();
    await expect(a).rejects.toMatchObject({ status: 0, message: "OFFLINE" });
    const b = http.upload("/api/x", file(), () => undefined);
    FakeXhr.last!.ontimeout?.();
    await expect(b).rejects.toMatchObject({ status: 0, message: "OFFLINE" });
  });

  it("the website sends its cookies; 204 is an empty answer", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const http = createHttpClient({ baseUrl: "http://x", getToken: () => null, credentials: "include" });
    const p = http.upload("/api/x", file(), () => undefined);
    expect(FakeXhr.last!.withCredentials).toBe(true);
    FakeXhr.last!.answer(204, "");
    await expect(p).resolves.toBeUndefined();
  });

  it("without a progress callback the upload stays on fetch", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const fetchMock = vi.fn(async () => new Response('{"key":"k"}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const http = createHttpClient({ baseUrl: "http://x", getToken: () => null });
    await expect(http.upload("/api/x", file())).resolves.toEqual({ key: "k" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeXhr.last).toBeNull();
  });
});
