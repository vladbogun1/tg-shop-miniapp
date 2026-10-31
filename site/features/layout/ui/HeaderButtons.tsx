"use client";

import { Scale, ShoppingBag, User } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/i18n/context";
import { useCart, useCartCount } from "@/features/cart";
import { useCompare, useCompareCount } from "@/features/compare";
import { useHydrated } from "@/lib/hooks";
import { displayName, initials, rememberedUser, useSession } from "@/features/auth";
import { useSupportUnread } from "@/features/support/view";

export function CompareButton() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const count = useCompareCount();
  const open = useCompare((s) => s.openScreen);
  if (!hydrated || count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => open()}
      aria-label={t("compare.headerCount", { n: count })}
      title={t("compare.title")}
      className="tap relative hidden h-11 w-11 md:grid shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
    >
      <Scale className="h-5 w-5" strokeWidth={2.1} />
      <span
        key={count}
        className="cmp-bump absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border border-[var(--accent)] bg-[var(--bg)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-hi)]"
      >
        {count}
      </span>
    </button>
  );
}

export function CartButton() {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const count = useCartCount();
  const open = useCart((s) => s.openDrawer);
  const shown = hydrated ? count : 0;
  return (
    <button
      type="button"
      onClick={open}
      aria-label={shown > 0 ? t("header.cartCount", { n: shown }) : t("header.cart")}
      className="tap relative grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)] xl:w-auto xl:grid-flow-col xl:gap-2 xl:px-4"
    >
      <ShoppingBag className="h-5 w-5" strokeWidth={2.25} />
      <span className="hidden font-display text-[13px] font-semibold uppercase tracking-[.08em] xl:inline">{t("header.cart")}</span>
      {shown > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-ink)] shadow-[0_0_10px_rgba(255,102,0,.6)]">
          {shown}
        </span>
      )}
    </button>
  );
}

/**
 * Guest: person icon + "Sign in". Signed in: person icon + the Telegram initials ("ВБ").
 * The session is only known in the browser (HttpOnly cookies), so SSR and the first client render
 * show a skeleton. The button hugs its content (a fixed width left the signed-in state with big
 * empty paddings); the header's right group is right-aligned, so only the space to its left changes.
 */
/** Hug the content (icon + «Увійти» or icon + initials) instead of one fixed width for every state. */
export const ACCOUNT_W = "w-11 lg:w-auto lg:px-3.5";
/** The skeleton can't know which state comes next; a width between the two keeps the shift small. */
export const ACCOUNT_SKELETON_W = "w-11 lg:w-[96px]";

export function AccountButton() {
  const { t, href } = useI18n();
  const { status, unread: orderUnread } = useSession();
  const unread = orderUnread + useSupportUnread();

  if (status === "loading") {
    return <span aria-hidden className={`shimmer block h-11 shrink-0 ${ACCOUNT_SKELETON_W}`} />;
  }

  const authed = status === "authed";
  // Only read after the session answered, i.e. never during SSR/hydration.
  const user = authed ? rememberedUser() : null;
  const letters = initials(user);
  const name = displayName(user);
  const label = authed ? (name ? t("header.accountOf", { name }) : t("header.account")) : t("header.login");

  return (
    <Link
      href={authed ? href("/account") : href("/login")}
      aria-label={label}
      title={label}
      className={`tap relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] ${ACCOUNT_W}`}
    >
      <User className={`h-5 w-5 shrink-0 ${letters ? "hidden lg:block" : ""}`} strokeWidth={2.25} />
      {authed ? (
        letters && (
          <span
            aria-hidden
            className="grid h-7 min-w-7 place-items-center rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-1 font-display text-[12px] font-bold leading-none tracking-wide text-[var(--accent-hi)]"
          >
            {letters}
          </span>
        )
      ) : (
        <span aria-hidden className="hidden font-display text-[13px] font-semibold uppercase tracking-[.08em] lg:inline">
          {t("header.login")}
        </span>
      )}
      {authed && unread > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1 font-display text-[11px] font-bold leading-none text-[var(--accent-ink)]">
          {unread}
        </span>
      )}
    </Link>
  );
}

