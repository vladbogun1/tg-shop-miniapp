"use client";

/**
 * App-wide client providers:
 *  - TanStack Query (data cache, background refetch).
 *  - Telegram init (ready/expand/safe areas) via useTelegram().
 *  - Auth boot: exchange initData → JWT (held in memory by lib/api).
 *  - Deep link: ?startapp=order_<id> opens that order's chat, ?startapp=cart the cart,
 *    ?startapp=preorders «Мої очікування», ?startapp=pp_<productId> that product.
 *  - Interaction journal (lib/analytics): buffered locally, flushed to the backend in batches.
 *  - Server cart sync (lib/cart-sync): the cart follows the customer to the website and back.
 *  - Language (i18n/context): resolved from the device, then Telegram, then Ukrainian.
 *
 * Everything degrades gracefully outside Telegram / with the backend offline.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@shop/ui/toast";
import { UiLookProvider } from "@shop/ui/look";
import { I18nProvider } from "@/i18n/context";
import { startAnalytics, track } from "@/lib/analytics";
import { authWithTelegram } from "@/lib/api";
import { startCartSync } from "@/features/cart";
import { parseSupportDeepLink } from "@/features/support";
import {
  getStartParam,
  parseOrderDeepLink, parseOrderViewDeepLink, parseProductDeepLink,
  useHideMainButton,
  useTelegram,
} from "@/platform/telegram";

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
  // Server cart shared with the website; waits for the token before touching /api/me/cart.
  useEffect(() => startCartSync(), []);
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
    const param = getStartParam();
    // cart: the bot's "case discount" message → the cart, where the code is offered.
    if (param === "cart") {
      router.push("/cart");
      return;
    }
    // preorders / pp_<productId>: the bot's queue and hold messages → «Мої очікування» / the product.
    if (param === "preorders") {
      router.push("/account/preorders");
      return;
    }
    const productId = parseProductDeepLink(param);
    if (productId) {
      if (window.location.pathname === "/") {
        // already on the catalog: the page listens for this event (router.push would land after it)
        window.history.replaceState(null, "", `/?product=${productId}`);
        window.dispatchEvent(new Event("shop:product-link"));
      } else {
        router.push(`/?product=${productId}`);
      }
      return;
    }
    const viewId = parseOrderViewDeepLink(param);
    if (viewId) {
      router.push(`/account/orders/${viewId}`);
      return;
    }
    // support_<threadId>: the bot's "support replied" button → that support thread.
    const supportId = parseSupportDeepLink(param);
    if (supportId) {
      router.push(`/account/support/${supportId}/chat`);
      return;
    }
    const orderId = parseOrderDeepLink(param);
    if (orderId) {
      router.push(`/account/orders/${orderId}/chat`);
    }
  }, [tg.ready, router]);

  return (
    <QueryClientProvider client={client}>
      <UiLookProvider look="miniapp">
        <I18nProvider>{children}</I18nProvider>
        <Toaster />
      </UiLookProvider>
    </QueryClientProvider>
  );
}
