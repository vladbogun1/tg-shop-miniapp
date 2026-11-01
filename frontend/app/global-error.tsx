"use client";

import { TEXTS } from "@/i18n/global-error-texts";


/** Last resort for the Mini App: the root layout or Providers crashed (texts: i18n/global-error-texts.ts). */

function pick() {
  const lang = typeof navigator === "undefined" ? "" : navigator.language.slice(0, 2).toLowerCase();
  return lang === "ru" ? TEXTS.ru : lang === "en" ? TEXTS.en : TEXTS.uk;
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error(error);
  const t = pick();
  return (
    <html lang="uk">
      <body style={{ margin: 0, background: "#0E0E10", color: "#F4F4F5", fontFamily: "system-ui, sans-serif" }}>
        <div role="alert" style={{ maxWidth: 320, margin: "20vh auto 0", padding: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>{t.title}</h1>
          <p style={{ fontSize: 14, color: "#A1A1AA" }}>{t.text}</p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#FF6600", color: "#000", border: 0, borderRadius: 6, padding: "10px 20px", fontWeight: 700 }}
          >
            {t.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
