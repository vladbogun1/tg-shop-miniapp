"use client";

/**
 * Bottom tab-bar — ChiSetup: floating translucent graphite bar (blur, radius 16, hairline). The
 * active tab turns orange and gets a 2px glowing bar on top. Shop / Cart / Account. Safe-area
 * aware, ≥44px.
 *
 * It hides itself in three cases and publishes its height as `--tabbar-h` so every page that
 * docks something to the bottom (cart summary, checkout actions, page padding) follows along
 * instead of hardcoding an offset:
 *   - in the chat, which owns the whole screen;
 *   - during checkout — from there the customer is finishing an order, not browsing, and the bar
 *     cost ~84px of the little vertical space the delivery step needs;
 *   - while the on-screen keyboard is up, where it used to cover the very field being typed in.
 */
import { motion } from "framer-motion";
import { ShoppingBag, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useT } from "@/i18n/context";
import { useCartCount } from "@/lib/cart";
import { useKeyboardOpen } from "@/lib/viewport";

const TABS = [
  { href: "/", labelKey: "tabs.shop", Icon: ShoppingBag },
  { href: "/cart", labelKey: "tabs.cart", Icon: ShoppingCart },
  { href: "/account", labelKey: "tabs.account", Icon: User },
] as const;

/** Bar height + its bottom margin; mirrored into `--tabbar-h` for the docked blocks. */
const BAR_H = "84px";

export function TabBar() {
  const t = useT();
  const pathname = usePathname();
  const cartCount = useCartCount();
  const keyboardOpen = useKeyboardOpen();

  const hidden =
    pathname.includes("/chat") || pathname.startsWith("/checkout") || keyboardOpen;

  useEffect(() => {
    document.documentElement.style.setProperty("--tabbar-h", hidden ? "0px" : BAR_H);
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      className="fixed inset-x-3 bottom-0 z-40 mx-auto flex max-w-[456px] items-stretch justify-around rounded-[16px] border border-[var(--line)] p-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)] backdrop-blur-[14px]"
      style={{ marginBottom: "max(12px, var(--safe-bottom))", background: "rgba(26,26,26,.92)" }}
    >
      {TABS.map(({ href, labelKey, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="tap relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
          >
            {active && (
              <motion.span
                layoutId="tab-highlight"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute left-1/2 top-[-6px] h-[2px] w-9 -translate-x-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_2px_rgba(255,102,0,.55)]"
              />
            )}
            <span className="relative z-10">
              <Icon
                className="h-[22px] w-[22px] transition-colors"
                strokeWidth={active ? 2.25 : 2}
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              />
              {href === "/cart" && cartCount > 0 && (
                <span className="font-display absolute -right-2.5 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--accent-ink)] ring-2 ring-[#1a1a1a]">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            <span
              className="font-display relative z-10 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors"
              style={{ color: active ? "var(--accent)" : "var(--muted)" }}
            >
              {t(labelKey)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
