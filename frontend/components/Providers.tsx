"use client";

/**
 * App-wide client providers:
 *  - TanStack Query (data cache, background refetch).
 *  - Telegram SDK init (ready/expand/theme) via useTelegram().
 *  - Auth boot: exchange initData -> JWT (stored in memory by lib/api).
 *
 * Everything degrades gracefully when not inside Telegram / backend offline.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authWithTelegram } from "@/lib/api";
import { getStartParam, parseOrderDeepLink, useTelegram } from "@/lib/telegram";

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
  const authed = useRef(false);
  const deepLinked = useRef(false);

  // Boot auth once initData is available.
  useEffect(() => {
    if (!tg.ready || authed.current) return;
    authed.current = true;
    authWithTelegram(tg.initDataRaw).catch(() => {
      // Backend offline or no initData (dev) — public endpoints still work.
    });
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
