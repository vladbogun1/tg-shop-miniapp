"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";

/** Nothing to order: the cart is empty. */
export function EmptyCartState() {
  const t = useT();
  return (
    <div className="pt-2">
      <h1 className="mb-6 text-[28px] font-extrabold font-display uppercase tracking-[0.02em] text-[var(--ink)]">
        {t("checkout.title")}
      </h1>
      <div className="flex flex-col items-center gap-4 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-6 py-16 text-center shadow-[0_8px_24px_-12px_var(--shadow)]">
        <p className="text-[14px] font-bold text-[var(--muted)]">{t("checkout.emptyCart")}</p>
        <Link href="/">
          <Button variant="accent">{t("common.toCatalog")}</Button>
        </Link>
      </div>
    </div>
  );
}

/** The order went through — on the way to its page. */
export function RedirectingState() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 pt-24 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" strokeWidth={2.5} />
      <p className="font-display text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
        {t("checkout.redirecting")}
      </p>
    </div>
  );
}
