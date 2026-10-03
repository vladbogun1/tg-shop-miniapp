"use client";

/**
 * Last-resort error page (the root layout itself failed), so no providers, fonts or dictionaries
 * are available — plain Ukrainian with inline styles in the same neo spirit.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="uk">
      <body style={{ margin: 0, background: "#F4F1E6", color: "#141414", fontFamily: "Arial, sans-serif" }}>
        <div style={{ maxWidth: 560, margin: "80px auto", padding: 32, border: "3px solid #141414", boxShadow: "7px 7px 0 #141414", background: "#fff", textAlign: "center" }}>
          <p style={{ fontSize: 96, fontWeight: 900, margin: 0, color: "#FF5A2C" }}>500</p>
          <h1 style={{ textTransform: "uppercase" }}>Щось пішло не так</h1>
          <p>Спробуйте оновити сторінку.</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "12px 20px", border: "3px solid #141414", background: "#FF5A2C", fontWeight: 800, textTransform: "uppercase", cursor: "pointer" }}
          >
            Повторити
          </button>
        </div>
      </body>
    </html>
  );
}
