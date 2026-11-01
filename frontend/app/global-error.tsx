"use client";

/* eslint-disable front/ratchet -- the dictionaries are unavailable here (the root providers crashed): inline texts on purpose */

/**
 * Last resort for the Mini App: the root layout or Providers crashed, so the dictionaries and styles
 * are not available. Texts are inline in the three languages, picked from the browser language.
 */
const TEXTS = {
  uk: { title: "Щось пішло не так", text: "Застосунок не завантажився. Спробуйте ще раз.", retry: "Повторити" },
  ru: { title: "Что-то пошло не так", text: "Приложение не загрузилось. Попробуйте ещё раз.", retry: "Повторить" },
  en: { title: "Something went wrong", text: "The app failed to load. Please try again.", retry: "Retry" },
} as const;

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
