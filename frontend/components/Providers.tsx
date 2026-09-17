"use client";

/**
 * App-wide client providers:
 *  - TanStack Query (data cache, background refetch).
 *  - Telegram init (ready/expand/safe areas) via useTelegram().
 *  - Auth boot: exchange initData → JWT (held in memory by lib/api).
 *  - Deep link: ?startapp=order_<id> opens that order's chat.
 *  - Interaction journal (lib/analytics): buffered locally, flushed to the backend in batches.
 *
 * Everything degrades gracefully outside Telegram / with the backend offline.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { startAnalytics, track } from "@/lib/analytics";
import { authWithTelegram } from "@/lib/api";
import {
  getStartParam,
  parseOrderDeepLink,
  useHideMainButton,
  useTelegram,
} from "@/lib/telegram";

/** Give up after this many attempts so a genuinely broken backend stops being retried forever. */
const MAX_AUTH_ATTEMPTS = 4;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);
  const tg = useTelegram();
  const router = useRouter();
  const pathname = usePathname();
  const deepLinked = useRef(false);

  // Clicks, screen views and client errors, buffered locally and shipped in batches.
  useEffect(() => startAnalytics(), []);
  useEffect(() => {
    track("view", pathname);
  }, [pathname]);

  // The native Telegram MainButton stays hidden; each screen renders its own primary button.
  useHideMainButton();

  // Boot auth. The previous version flipped an "already tried" flag BEFORE awaiting, so a single
  // transient failure (backend still starting, flaky mobile connection) left the app permanently
  // unauthenticated: every /api/me call 401'd and the account tab just looked broken.
  useEffect(() => {
    if (!tg.ready || !tg.initDataRaw) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tryAuth = () => {
      authWithTelegram(tg.initDataRaw).catch(() => {
        if (cancelled || ++attempt >= MAX_AUTH_ATTEMPTS) return;
        // Back off: 1s, 2s, 4s.
        timer = setTimeout(tryAuth, 1000 * 2 ** (attempt - 1));
      });
    };
    tryAuth();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tg.ready, tg.initDataRaw]);

  // Deep-link: ?startapp=order_<id> (or Telegram start_param) → open that chat.
  useEffect(() => {
    if (!tg.ready || deepLinked.current) return;
    deepLinked.current = true;
    const orderId = parseOrderDeepLink(getStartParam());
    if (orderId) {
      router.push(`/account/orders/${orderId}/chat`);
    }
  }, [tg.ready, router]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
