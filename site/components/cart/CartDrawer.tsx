"use client";

/**
 * Right-hand cart drawer (vinli-style): lines with qty ± / remove, total, "Оформить".
 * Opened by the header cart button and by "В корзину" on the product page. Re-validates prices and
 * stock against the server every time it opens.
 */
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { buttonClass } from "@/components/ui/button-styles";
import { useI18n } from "@/i18n/context";
import { useCart, useCartCount, useCartSubtotal } from "@/lib/cart";
import { useCartValidation } from "@/lib/cart-validation";
import { useEscape, useScrollLock } from "@/lib/hooks";
import { useFmt } from "@/lib/use-fmt";
import { CartEmpty, CartLines } from "./CartLines";

export function CartDrawer() {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const open = useCart((s) => s.drawerOpen);
  const close = useCart((s) => s.closeDrawer);
  const lines = useCart((s) => s.lines);
  const count = useCartCount();
  const subtotal = useCartSubtotal();
  const pathname = usePathname();
  const { validating } = useCartValidation(open);
  const hasProblems = lines.some((l) => l.stock <= 0);

  useScrollLock(open);
  useEscape(open, close);
  // A navigation (e.g. to a product from the drawer) closes it.
  useEffect(() => {
    close();
  }, [pathname, close]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="cart-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[60] bg-black/50"
            aria-hidden
          />
          <motion.aside
            key="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-drawer-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-[460px] flex-col border-l-[3px] border-[var(--line)] bg-[var(--bg)]"
          >
            <header className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <h2 id="cart-drawer-title" className="text-[20px] font-black uppercase tracking-tight text-[var(--ink)]">
                {t("cart.title")}
                {count > 0 && (
                  <span className="ml-2 text-[14px] font-bold text-[var(--muted)]">{t("cart.count", { n: count })}</span>
                )}
              </h2>
              <div className="flex items-center gap-2">
                {validating && <Loader2 className="h-4 w-4 animate-spin text-[var(--muted)]" aria-hidden />}
                <button
                  type="button"
                  autoFocus
                  onClick={close}
                  aria-label={t("common.close")}
                  className="nb-flat tap grid h-11 w-11 place-items-center text-[var(--ink)] hover:bg-[var(--surface-2)]"
                >
                  <X className="h-5 w-5" strokeWidth={3} />
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {lines.length === 0 ? <CartEmpty onNavigate={close} /> : <CartLines onNavigate={close} compact />}
            </div>

            {lines.length > 0 && (
              <footer className="border-t-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-black uppercase tracking-wide text-[var(--ink)]">{t("cart.total")}</span>
                  <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[20px] font-black text-[var(--accent-ink)]">
                    {fmt.money(subtotal)}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] font-medium text-[var(--muted)]">{t("cart.deliveryNote")}</p>
                {hasProblems && (
                  <p className="mt-2 text-[12px] font-extrabold text-[var(--danger)]">{t("cart.hasProblems")}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={close} className={buttonClass("surface", "md", true)}>
                    <span className="truncate">{t("cart.continue")}</span>
                  </button>
                  <Link
                    href={href("/checkout")}
                    aria-disabled={hasProblems || subtotal === 0}
                    onClick={(e) => {
                      if (hasProblems || subtotal === 0) e.preventDefault();
                      else close();
                    }}
                    className={`${buttonClass("accent", "md", true)} ${hasProblems ? "pointer-events-none opacity-50" : ""}`}
                  >
                    <span className="truncate">{t("cart.checkout")}</span>
                  </Link>
                </div>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
