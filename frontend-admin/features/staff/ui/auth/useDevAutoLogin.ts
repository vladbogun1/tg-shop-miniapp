"use client";

import { useEffect } from "react";
import { sessionStore } from "@shop/core/storage";
import { nowMs } from "@shop/core/time";
import { setAccessToken } from "@/lib/session";
import { devSignIn } from "../../api";

/**
 * Local stand only (`next dev` + DEV_ADMIN_CREDS, see app/dev-login/route.ts): signs in with no
 * password and no code. In a production build the condition is a constant false and the effect is empty.
 */
export function useDevAutoLogin(done: () => void) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    // Back on this screen right after an auto sign-in: the remembered token was refused, ask for a new one.
    const last = Number(sessionStore.getItem("devLoginAt")) || 0;
    // Refused twice in a row: stop, the form is there (retrying would only hit the backend rate limit).
    if (nowMs() - last < 15_000 && last % 2 === 1) return;
    const fresh = nowMs() - last < 15_000;
    devSignIn(fresh)
      .then((r) => {
        if (cancelled || !r.accessToken) return;
        // odd timestamp = this sign-in was already the fresh retry
        const now = nowMs();
        sessionStore.setItem("devLoginAt", String(now - (now % 2) + (fresh ? 1 : 0)));
        setAccessToken(r.accessToken);
        done();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [done]);
}
