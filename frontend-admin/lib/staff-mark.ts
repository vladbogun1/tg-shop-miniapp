/**
 * Marks this browser as the shop's staff so the website does not count the admin's own visits as a
 * customer's (funnel, product interest, visitors). The cookie `mx_staff=1` is set on the shop's
 * parent domain — admin.chisetup.com.ua → .chisetup.com.ua (admin.demo.… → .demo.…) — so the
 * site's analytics flushes carry it and the backend drops them (PublicAnalyticsController).
 * On localhost it is a host cookie, which browsers share across ports. Nothing personal in it.
 */
const COOKIE = "mx_staff";
const MAX_AGE = 400 * 24 * 3600; // browsers cap cookie lifetime at 400 days

let marked = false;

export function markStaffBrowser(): void {
  if (marked || typeof document === "undefined") return;
  marked = true;
  try {
    const host = location.hostname;
    const domain = host.startsWith("admin.") ? `; domain=.${host.slice("admin.".length)}` : "";
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `${COOKIE}=1; path=/; max-age=${MAX_AGE}; samesite=lax${domain}${secure}`;
  } catch {
    /* never let this break the panel */
  }
}
