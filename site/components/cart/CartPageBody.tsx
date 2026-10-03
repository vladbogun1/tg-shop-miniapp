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
      <h1 className="text-[32px] font-black uppercase tracking-tight text-[var(--ink)]">
        {t("cart.title")}
        {hydrated && count > 0 && (
          <span className="ml-3 text-[16px] font-bold text-[var(--muted)]">{t("cart.count", { n: count })}</span>
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
          <aside className="nb h-fit p-5 lg:sticky lg:top-[140px]">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-black uppercase text-[var(--ink)]">{t("cart.total")}</span>
              <span className="border-[2.5px] border-[var(--line)] bg-[var(--c3)] px-2 py-0.5 text-[22px] font-black text-[var(--accent-ink)]">
                {fmt.money(subtotal)}
              </span>
            </div>
            <p className="mt-2 text-[12px] font-medium text-[var(--muted)]">{t("cart.deliveryNote")}</p>
            {hasProblems && <p className="mt-2 text-[12px] font-extrabold text-[var(--danger)]">{t("cart.hasProblems")}</p>}
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
