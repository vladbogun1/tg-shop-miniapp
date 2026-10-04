"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/button-styles";
import { useI18n } from "@/i18n/context";
import { useCart, useCartCount, useCartSubtotal } from "@/lib/cart";
import { useCartValidation } from "@/lib/cart-validation";
import { useHydrated } from "@/lib/hooks";
import { useFmt } from "@/lib/use-fmt";
import { CartEmpty, CartLines } from "./CartLines";

/** Full-page cart (/cart): same lines as the drawer, summary on the right. */
export function CartPageBody() {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const hydrated = useHydrated();
  const lines = useCart((s) => s.lines);
  const count = useCartCount();
  const subtotal = useCartSubtotal();
  useCartValidation(true);
  const hasProblems = lines.some((l) => l.stock <= 0);

  return (
    <div className="container-site pt-8">
      <h1 className="font-display text-[30px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)] sm:text-[36px]">
        {t("cart.title")}
        {hydrated && count > 0 && (
          <span className="ml-3 text-[16px] font-medium text-[var(--muted)]">{t("cart.count", { n: count })}</span>
        )}
      </h1>
      {!hydrated ? (
        <div className="shimmer mt-6 h-40" />
      ) : lines.length === 0 ? (
        <div className="nb mt-6">
          <CartEmpty />
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <CartLines />
          <aside className="nb hud-frame h-fit p-5 lg:sticky lg:top-[140px]">
            <div className="flex items-center justify-between">
              <span className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("cart.total")}</span>
              <span className="font-display text-[22px] font-bold tabular-nums text-[var(--accent)]">
                {fmt.money(subtotal)}
              </span>
            </div>
            <p className="mt-2 text-[12px] font-medium text-[var(--muted)]">{t("cart.deliveryNote")}</p>
            {hasProblems && <p className="mt-2 text-[12px] font-semibold text-[var(--danger)]">{t("cart.hasProblems")}</p>}
            <Link
              href={href("/checkout")}
              aria-disabled={hasProblems}
              className={`mt-4 ${buttonClass("accent", "lg", true)} ${hasProblems ? "pointer-events-none opacity-50" : ""}`}
            >
              <span className="truncate">{t("cart.checkout")}</span>
            </Link>
            <Link href={href("/catalog")} className={`mt-3 ${buttonClass("surface", "md", true)}`}>
              <span className="truncate">{t("cart.continue")}</span>
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
