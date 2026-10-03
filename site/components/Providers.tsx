"use client";

/**
 * App-wide client providers: TanStack Query, the language (from the route), the cart drawer and
 * the toast. Also tells the server which language this customer reads once they are signed in —
 * the bot then writes to them in it (same as the Mini App's POST /api/me/locale).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ToastHost } from "@/components/ui/Toast";
import { I18nProvider } from "@/i18n/context";
import type { Locale } from "@/i18n/locales";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
    },
  });
}

function LocaleSync({ locale }: { locale: Locale }) {
  const { status } = useSession();
  useEffect(() => {
    if (status !== "authed") return;
    api.setLocale(locale).catch(() => {
      /* a preference that failed to sync is not worth bothering anyone about */
    });
  }, [status, locale]);
  return null;
}

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>
        <LocaleSync locale={locale} />
        {children}
        <CartDrawer />
        <ToastHost />
      </I18nProvider>
    </QueryClientProvider>
  );
}
