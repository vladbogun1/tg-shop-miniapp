"use client";

import { useEffect } from "react";
import { setAccessToken } from "@/lib/api";

/**
 * Local stand only (`next dev` + DEV_ADMIN_CREDS, see app/dev-login/route.ts): signs in with no
 * password and no code. In a production build the condition is a constant false and the effect is empty.
 */
export function useDevAutoLogin(done: () => void) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    // Back on this screen right after an auto sign-in: the remembered token was refused, ask for a new one.
    let last = 0;
    try {
      last = Number(sessionStorage.getItem("devLoginAt")) || 0;
    } catch {}
    // Refused twice in a row: stop, the form is there (retrying would only hit the backend rate limit).
    if (Date.now() - last < 15_000 && last % 2 === 1) return;
    const fresh = Date.now() - last < 15_000;
    fetch(fresh ? "/dev-login?fresh=1" : "/dev-login", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { accessToken?: string } | null) => {
        if (cancelled || !r?.accessToken) return;
        try {
          // odd timestamp = this sign-in was already the fresh retry
          const now = Date.now();
          sessionStorage.setItem("devLoginAt", String(now - (now % 2) + (fresh ? 1 : 0)));
        } catch {}
        setAccessToken(r.accessToken);
        done();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [done]);
}
