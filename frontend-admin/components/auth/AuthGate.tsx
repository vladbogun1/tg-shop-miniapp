"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, isAuthenticated, onUnauthorized, authAdminTelegram, type AdminLoginResult } from "@/lib/api";
import { getTelegramInitData } from "@/lib/telegram";
import { Login } from "@/components/auth/Login";
import { Shell } from "@/components/layout/Shell";
import { CenterSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/lib/toast";

/**
 * Signed in → the app. Otherwise the sign-in: inside Telegram the first factor is tried with the
 * Mini App's initData right away (it is single-use on the server), and the code / 2FA-setup step
 * follows on the Login screen; in a browser — login and password.
 *
 * /invite/<token> is public (a new admin has no account yet): rendered bare, without the sign-in
 * and without the shell.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/invite/")) return <>{children}</>;
  return <SignedIn>{children}</SignedIn>;
}

function SignedIn({ children }: { children: React.ReactNode }) {
  const { push } = useToast();
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [pending, setPending] = useState<AdminLoginResult | null>(null);

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
          const res = await authAdminTelegram(initData);
          if (!cancelled) {
            if (res.status === "OK") setAuthed(true);
            else setPending(res);
          }
        } catch (e) {
          // Not an admin, expired/used initData, locked — the password form stays available.
          if (!cancelled && e instanceof ApiError && e.status === 429) push(e.message, "error");
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
  }, [push]);

  if (booting) return <CenterSpinner label="Загрузка…" />;
  if (!authed)
    return (
      <Login
        initial={pending}
        onSuccess={() => {
          setPending(null);
          setAuthed(true);
        }}
      />
    );
  return <Shell>{children}</Shell>;
}
