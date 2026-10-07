/**
 * GET /pay-return?order=<id>&embedded=1 (also /ru/…, /en/…) — where monobank sends the payment
 * frame (PaymentModal, `displayType: "iframe"`) after the customer has paid.
 *
 * It is shown INSIDE that frame, so it is a bare HTML document from a route handler rather than a
 * page: the [locale] layout would put the whole site (header, footer, preloader, cart sync,
 * analytics) into a 600-px frame for the second it is visible. All it does is tell the parent window
 * "done" — `postMessage({ source: "chisetup-pay", type: "done", order })` to our own origin, no
 * payment data — and the modal closes and asks our API for the real status. Opened top-level (not
 * normally: the new-tab fallback returns to the order page itself) it goes to the order page.
 *
 * The only page of the site that may be framed, and only by the site itself: see next.config.ts and
 * infra/gateway-site.conf.template (`frame-ancestors 'self'`, no X-Frame-Options DENY here).
 */
import { notFound } from "next/navigation";
import { localePath, makeT } from "@/i18n";
import { isLocale, LOCALE_TAG } from "@/i18n/locales";

export const dynamic = "force-dynamic";

const ORDER_ID = /^[0-9a-fA-F-]{8,64}$/;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** JSON for an inline <script>: `<` escaped so no value can close the tag. */
function js(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c");
}

export async function GET(req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = makeT(locale);
  const raw = new URL(req.url).searchParams.get("order") ?? "";
  const order = ORDER_ID.test(raw) ? raw : "";
  const orderPage = order
    ? localePath(locale, `/account/orders/${order}`) + "?payment=return"
    : localePath(locale, "/account");

  const html = `<!doctype html>
<html lang="${LOCALE_TAG[locale]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(t("pay.return.title"))}</title>
<style>
html,body{height:100%;margin:0}
body{display:grid;place-items:center;background:#0E0E10;color:#fff;font:500 15px/1.45 "Helvetica Neue",Arial,system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
.s{width:36px;height:36px;margin:0 auto 18px;border:3px solid rgba(255,255,255,.12);border-top-color:#FF6600;border-radius:50%;animation:r 0.9s linear infinite}
@keyframes r{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.s{animation:none}}
h1{margin:0 0 8px;font-size:18px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
p{margin:0 0 18px;color:#A1A1AA;font-size:14px;max-width:360px}
a{color:#FF8533;font-weight:700;font-size:14px}
</style>
</head>
<body>
<main>
<div class="s" aria-hidden="true"></div>
<h1>${esc(t("pay.return.title"))}</h1>
<p>${esc(t("pay.return.text"))}</p>
<a href="${esc(orderPage)}" target="_top">${esc(t("pay.return.link"))}</a>
</main>
<script>
(function(){
  var order=${js(order)}, orderPage=${js(orderPage)};
  if (window.parent && window.parent !== window) {
    try { window.parent.postMessage({source:"chisetup-pay",type:"done",order:order}, location.origin); } catch (e) {}
  } else {
    location.replace(orderPage);
  }
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
