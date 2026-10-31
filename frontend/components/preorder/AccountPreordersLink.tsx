"use client";

/** Account screen entry «Мої очікування» → /account/preorders, with a count of live holds. */
import { ChevronRight, Truck } from "lucide-react";
import Link from "next/link";
import { PRE_COLOR } from "@/components/preorder/colors";
import { useT } from "@/i18n/context";
import { useHeldCount } from "@/lib/preorders";
import { haptic } from "@/lib/telegram";

export function AccountPreordersLink() {
  const t = useT();
  const held = useHeldCount();
  return (
    <Link href="/account/preorders" onClick={() => haptic()} className="nb nb-press tap mb-3 flex items-center gap-3 p-4">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)]"
        style={{ color: PRE_COLOR }}
      >
        <Truck className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold text-[var(--ink)]">{t("preorder.account.title")}</p>
        <p className="truncate text-[12px] text-[var(--muted)]">
          {held > 0 ? t("preorder.account.held", { n: held }) : t("preorder.account.subtitle")}
        </p>
      </div>
      {held > 0 && (
        <span className="font-display rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-bold text-[var(--accent-ink)]">{held}</span>
      )}
      <ChevronRight className="h-5 w-5 text-[var(--faint)]" strokeWidth={2.25} aria-hidden />
    </Link>
  );
}
