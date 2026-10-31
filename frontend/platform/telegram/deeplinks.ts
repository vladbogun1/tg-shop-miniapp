import { webApp } from "./webapp";

/**
 * Read the launch `start_param` / `startapp` value (e.g. "order_<id>").
 * Falls back to the URL query (?startapp= / ?tgWebAppStartParam=) for browser dev.
 */
export function getStartParam(): string | null {
  const wa = webApp();
  if (wa?.initDataUnsafe?.start_param) return wa.initDataUnsafe.start_param;
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    return (
      q.get("startapp") ??
      q.get("tgWebAppStartParam") ??
      q.get("start_param") ??
      null
    );
  }
  return null;
}

/** Parse "order_<id>" deep-link → order id, else null. */
export function parseOrderDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^order[_-](.+)$/.exec(param);
  return m ? m[1] : null;
}

/** `view_<id>` — open the order page itself (the bot's "payment received" message). */
export function parseOrderViewDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^view[_-](.+)$/.exec(param);
  return m ? m[1] : null;
}

/**
 * `pp_<productId>` — open that product (the bot's «приїхав, бронь до …» button). The id is a UUID, with
 * or without dashes; returned in the dashed form the API uses. Null for anything else.
 */
export function parseProductDeepLink(param: string | null): string | null {
  if (!param) return null;
  const m = /^pp[_-]([0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12})$/.exec(param);
  if (!m) return null;
  const h = m[1].replace(/-/g, "").toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
