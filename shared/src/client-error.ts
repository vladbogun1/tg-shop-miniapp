/**
 * What a client-side error was — for the error journal of the Mini App and the website.
 *
 * Until now only `e.message` was kept, and every row on prod read "Script error.": the browser
 * hides the details of errors thrown by a script from another origin unless it was loaded with
 * `crossorigin`. Even with that fixed, the message alone does not say WHERE it broke, so `meta`
 * carries the source file, line/column, the top of the stack and the runtime (Telegram client
 * platform/version, user agent) the caller adds.
 */
export interface ErrorInfo {
  message: string;
  meta: string;
}

function shortSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  // Same-origin chunks: the path is enough. Foreign scripts keep their host.
  try {
    const u = new URL(src, location.href);
    return (u.origin === location.origin ? u.pathname : u.host + u.pathname).slice(0, 120);
  } catch {
    return src.slice(0, 120);
  }
}

function stackHead(err: unknown): string | undefined {
  const stack = err instanceof Error ? err.stack : undefined;
  if (!stack) return undefined;
  return stack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ")
    .slice(0, 240);
}

/** Describes an `error` or `unhandledrejection` event; `extra` is merged into meta. */
export function describeError(
  e: ErrorEvent | PromiseRejectionEvent,
  extra?: Record<string, unknown>,
): ErrorInfo {
  const meta: Record<string, unknown> = { ...extra };
  let message: string;
  if ("reason" in e) {
    const r = e.reason;
    message = r instanceof Error ? `${r.name}: ${r.message}` : String(r);
    meta.kind = "rejection";
    meta.stack = stackHead(r);
  } else {
    message = e.message || "error";
    meta.src = shortSrc(e.filename);
    if (e.lineno) meta.at = `${e.lineno}:${e.colno}`;
    meta.stack = stackHead(e.error);
  }
  try {
    meta.ua = navigator.userAgent.slice(0, 160);
  } catch {
    /* no navigator */
  }
  for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
  // The server caps meta at 512 chars; trim the stack first rather than cutting the JSON.
  let json = JSON.stringify(meta);
  if (json.length > 500 && typeof meta.stack === "string") {
    meta.stack = meta.stack.slice(0, Math.max(0, 240 - (json.length - 500)));
    json = JSON.stringify(meta);
  }
  if (json.length > 500) {
    delete meta.ua;
    json = JSON.stringify(meta);
  }
  return { message: message.slice(0, 120), meta: json.slice(0, 500) };
}

const seen = new Map<string, number>();

/**
 * False once the same error was already reported 3 times on this page — an error thrown from a
 * timer or a render loop must not flood the journal (and push real taps out of the buffer).
 */
export function reportable(info: ErrorInfo): boolean {
  const n = (seen.get(info.message) ?? 0) + 1;
  seen.set(info.message, n);
  return n <= 3;
}
