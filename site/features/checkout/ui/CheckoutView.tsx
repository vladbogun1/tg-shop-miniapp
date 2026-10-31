"use client";

/**
 * Checkout — ONE page, two columns on desktop, stacked on phones (see CheckoutForm).
 *
 * This is the gate: a guest is sent to /login first, the empty cart gets its own screen, and after
 * the order is placed the browser is on its way to the order page (and the monobank payment form,
 * docs/MONOBANK-ACQUIRING.md) — show a spinner, not a frozen form.
 */
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { usePageRestore } from "@/components/order/Payment";
import { useI18n } from "@/i18n/context";
import { trackCheckoutStart } from "@/lib/analytics";
import { useCart } from "@/features/cart";
import { useHydrated } from "@/lib/hooks";
import { useSession } from "@/features/auth";
import { CheckoutForm } from "./CheckoutForm";

export function CheckoutView() {
  const { t, href } = useI18n();
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  /** The order just placed, while the browser is on its way to its page (and the payment form). */
  const [leavingFor, setLeavingFor] = useState<string | null>(null);

  // Back here with the browser's Back button (bfcache, e.g. from the new-tab payment page opened in
  // this tab): the cart is already empty and the order exists — show it, not a frozen spinner.
  usePageRestore(() => {
    if (leavingFor) router.replace(href(`/account/orders/${leavingFor}`));
  });

  // Funnel step "started checkout" — also for guests, who are sent to sign in from here: losing
  // people at the login wall is exactly what the funnel should show.
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (!hydrated || checkoutTracked.current || lines.length === 0) return;
    checkoutTracked.current = true;
    trackCheckoutStart();
  }, [hydrated, lines.length]);

  // Guests are sent to sign in first and come straight back here.
  useEffect(() => {
    if (session.status === "guest") {
      router.replace(href(`/login?next=${encodeURIComponent(href("/checkout"))}`));
    }
  }, [session.status, router, href]);

  if (!hydrated || session.status !== "authed") {
    return (
      <div className="container-site pt-10">
        <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--muted)]">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("checkout.checkingSession")}
        </p>
      </div>
    );
  }

  if (leavingFor) {
    return (
      <div className="container-site pt-10">
        <p className="flex items-center gap-2 text-[15px] font-medium text-[var(--muted)]" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("checkout.toPayment")}
        </p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-site pt-10">
        <h1 className="font-display text-[32px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">{t("checkout.title")}</h1>
        <div className="nb hud-frame mt-6 flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] font-medium text-[var(--muted)]">{t("checkout.emptyCart")}</p>
          <Link href={href("/catalog")} className="nb-accent nb-press tap nb-up px-5 py-3 text-[14px]">
            {t("common.toCatalog")}
          </Link>
        </div>
      </div>
    );
  }

  return <CheckoutForm onPlaced={setLeavingFor} />;
}
