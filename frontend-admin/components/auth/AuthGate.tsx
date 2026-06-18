"use client";

/**
 * AuthGate — gates the whole app behind admin auth.
 *  - On mount: if inside Telegram, auto-exchange initData for a JWT.
 *  - If a JWT is present (sessionStorage) -> render the app shell.
 *  - Otherwise -> Login screen.
 *  - On any 401/403 (lib/api onUnauthorized) -> drop back to Login.
 */
import { useEffect, useState } from "react";
import { isAuthenticated, onUnauthorized, authAdminTelegram } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import { Login } from "@/components/auth/Login";
import { Shell } from "@/components/layout/Shell";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (isAuthenticated()) {
        setAuthed(true);
        setBooting(false);
        return;
      }
      // Try Telegram auto-login.
      const initData = getTelegramInitData();
      if (initData) {
        try {
          await authAdminTelegram(initData);
          if (!cancelled) setAuthed(true);
        } catch {
          /* fall through to login */
        }
      }
      if (!cancelled) setBooting(false);
    }
    boot();
    const off = onUnauthorized(() => setAuthed(false));
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  if (booting) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="glass rounded-[var(--r-lg)] px-6 py-4 text-[var(--text-muted)]">
          Загрузка…
        </div>
      </div>
    );
  }

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Shell>{children}</Shell>;
}
