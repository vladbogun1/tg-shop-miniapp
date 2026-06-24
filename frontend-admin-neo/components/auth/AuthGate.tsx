"use client";

import { useEffect, useState } from "react";
import { isAuthenticated, onUnauthorized, authAdminTelegram } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import { Login } from "@/components/auth/Login";
import { Shell } from "@/components/layout/Shell";
import { CenterSpinner } from "@/components/ui/Spinner";

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

  if (booting) return <CenterSpinner label="Загрузка…" />;
  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;
  return <Shell>{children}</Shell>;
}
