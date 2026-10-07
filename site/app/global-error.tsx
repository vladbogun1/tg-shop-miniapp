"use client";

import { makeT } from "@/i18n";
import { FALLBACK_LOCALE, LOCALE_TAG, type Locale } from "@shop/shared";

/** The language from the URL prefix (/ru/…, /en/…) — no provider is mounted when this page shows. */
function urlLocale(): Locale {
  if (typeof window === "undefined") return FALLBACK_LOCALE;
  const m = window.location.pathname.match(/^\/(ru|en)(?=\/|$)/);
  return m ? (m[1] as Locale) : FALLBACK_LOCALE;
}

/**
 * Last-resort error page (the root layout itself failed), so no providers or fonts are available —
 * the dictionaries are plain data and are used directly, with inline styles in the v3 dark spirit.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = urlLocale();
  const t = makeT(locale);
  return (
    <html lang={LOCALE_TAG[locale]}>
      <body style={{ margin: 0, background: "#0E0E10", color: "#FFFFFF", fontFamily: "Arial, sans-serif" }}>
        <div style={{ maxWidth: 560, margin: "80px auto", padding: 32, border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, boxShadow: "0 18px 44px -18px rgba(0,0,0,.55)", background: "#1A1A1A", textAlign: "center" }}>
          <p style={{ fontSize: 96, fontWeight: 800, fontStyle: "italic", margin: 0, color: "#FF6600", textShadow: "0 0 40px rgba(255,102,0,.45)" }}>500</p>
          <h1 style={{ textTransform: "uppercase" }}>{t("error.title")}</h1>
          <p style={{ color: "#A1A1AA" }}>{t("error.global.text")}</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "12px 22px", border: 0, borderRadius: 6, background: "#FF6600", color: "#0E0E10", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", clipPath: "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)" }}
          >
            {t("common.retry")}
          </button>
        </div>
      </body>
    </html>
  );
}
