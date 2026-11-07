/**
 * Sending a form through XMLHttpRequest, because fetch reports no upload progress: a 5 MB phone photo over a mobile
 * network takes a while, and «загружается…» without a number looks like a hang. Only the transport lives here — the
 * HTTP client turns the answer into a Response and handles it like any other (errors, 401, JSON).
 */

export interface XhrSend {
  url: string;
  body: FormData;
  headers: Headers;
  /** "include" sends cookies (the website); otherwise the browser default. */
  withCredentials: boolean;
  timeoutMs: number;
  /** Share of the body sent, 0…1; called as the bytes go and once with 1 when the body is out. */
  onProgress: (sent: number) => void;
}

/** Status and body of the answer; rejects only when there is no answer (no network, timeout, abort). */
export function xhrSend(req: XhrSend): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", req.url);
    req.headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.withCredentials = req.withCredentials;
    xhr.timeout = req.timeoutMs;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) req.onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.upload.onload = () => req.onProgress(1);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText ?? "" });
    xhr.onerror = () => reject(new Error("network"));
    xhr.ontimeout = () => reject(new Error("timeout"));
    xhr.onabort = () => reject(new Error("abort"));
    xhr.send(req.body);
  });
}

/** The XHR answer as a fetch Response, so the client reads both the same way (204 and 205 carry no body). */
export function asResponse(status: number, text: string): Response {
  return new Response(status === 204 || status === 205 ? null : text, { status });
}
