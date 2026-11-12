"use client";

import { useEffect } from "react";
import { reportRenderError } from "@/features/telemetry";

/** Last resort: the root layout/Providers crashed, so nothing of the app (styles, i18n) can be relied on. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  console.error(error);
  // The shell is gone: the report goes out right away (keepalive, token from localStorage).
  useEffect(() => {
    reportRenderError(error, "global");
  }, [error]);
  return (
    <html lang="ru">
      <body
        style={{ margin: 0, background: "#0E0E10", color: "#F4F4F5", fontFamily: "system-ui, sans-serif" }}
      >
        <div role="alert" style={{ maxWidth: 360, margin: "20vh auto 0", padding: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Что-то пошло не так</h1>
          <p style={{ fontSize: 14, color: "#A1A1AA" }}>Админка не загрузилась. Попробуйте ещё раз.</p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#FF6600", color: "#000", border: 0, borderRadius: 6, padding: "10px 20px", fontWeight: 700 }}
          >
            Повторить
          </button>
        </div>
      </body>
    </html>
  );
}
