"use client";

/**
 * App-wide client providers: TanStack Query, the language (from the route), the cart drawer, the
 * server-cart sync of a signed-in customer and the toast. Also tells the server which language this customer reads once they are signed in —
 * the bot then writes to them in it (same as the Mini App's POST /api/me/locale).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Analytics } from "@/components/Analytics";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { ToastHost } from "@/components/ui/Toast";
import { I18nProvider } from "@/i18n/context";
import type { Locale } from "@shop/shared";
import { api } from "@/lib/api";
import { CartSync } from "@/lib/cart-sync";
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

/**
 * Focus rings are for keyboard users only. Browsers also treat focus moved by script (a menu handing
 * focus back to its button) and any focused text field as :focus-visible, so a mouse click left a
 * ring behind. Track how the person is interacting and let CSS hide rings while it's the pointer.
 */
function InputModality() {
  useEffect(() => {
    const root = document.documentElement;
    const pointer = () => root.setAttribute("data-input", "pointer");
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow") || e.key === "Escape") root.setAttribute("data-input", "keyboard");
    };
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", keyboard, true);
    };
  }, []);
  return null;
}

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <I18nProvider locale={locale}>
        <InputModality />
        <LocaleSync locale={locale} />
        <CartSync />
        <Analytics />
        {children}
        <CartDrawer />
        <ToastHost />
      </I18nProvider>
    </QueryClientProvider>
  );
}
