"use client";

/**
 * Bottom tab-bar — ChiSetup: floating translucent graphite bar (blur, radius 16, hairline). The
 * active tab turns orange and gets a 2px glowing bar on top. Shop / Cart / Account. Safe-area
 * aware, ≥44px.
 *
 * It hides itself in four cases and publishes its height as `--tabbar-h` so every page that
 * docks something to the bottom (cart summary, checkout actions, page padding) follows along
 * instead of hardcoding an offset:
 *   - in the chat, which owns the whole screen;
 *   - during checkout — from there the customer is finishing an order, not browsing, and the bar
 *     cost ~84px of the little vertical space the delivery step needs;
 *   - while the on-screen keyboard is up, where it used to cover the very field being typed in;
 *   - on /pay-return, which opens in a plain browser after paying, where the shop tabs lead nowhere.
 *
 * Compact (64px instead of 84): smaller paddings, icons and labels. In the catalogue it also slides
 * away while the list scrolls down and comes back on the first scroll up (or at the very top) — the
 * catalogue docks nothing to the bottom, so `--tabbar-h` stays as it is there.
 */
import { motion } from "framer-motion";
import { ShoppingBag, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/context";
import { useCartCount } from "@/lib/cart";
import { useKeyboardOpen } from "@/lib/viewport";

const TABS = [
  { href: "/", labelKey: "tabs.shop", Icon: ShoppingBag },
  { href: "/cart", labelKey: "tabs.cart", Icon: ShoppingCart },
  { href: "/account", labelKey: "tabs.account", Icon: User },
] as const;

/** Bar height + its bottom margin; mirrored into `--tabbar-h` for the docked blocks. */
const BAR_H = "64px";

export function TabBar() {
  const t = useT();
  const pathname = usePathname();
  const cartCount = useCartCount();
  const keyboardOpen = useKeyboardOpen();

  // catalogue only: hide while scrolling down, show on scroll up / near the top
  const autoHide = pathname === "/";
  const [tucked, setTucked] = useState(false);
  const lastY = useRef(0);
  useEffect(() => {
    if (!autoHide) {
      setTucked(false);
      return;
    }
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      if (Math.abs(dy) < 8) return; // ignore jitter and momentum tails
      setTucked(dy > 0 && y > 120);
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [autoHide]);

  // something just went into the cart: bring the bar back (it may have slid away) and give the cart
  // tab a bump, so it is obvious where the item went and where to go next
  const prevCount = useRef(cartCount);
  const [bump, setBump] = useState(0);
  const settledAt = useRef(0);
  useEffect(() => {
    settledAt.current = performance.now() + 2000; // the saved cart loading in after start is not an «add»
  }, []);
  useEffect(() => {
    if (cartCount > prevCount.current && performance.now() > settledAt.current) {
      setTucked(false);
      lastY.current = window.scrollY;
      setBump((b) => b + 1);
    }
    prevCount.current = cartCount;
  }, [cartCount]);

  const hidden =
    pathname.includes("/chat") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/pay-return") ||
    keyboardOpen;

  useEffect(() => {
    document.documentElement.style.setProperty("--tabbar-h", hidden ? "0px" : BAR_H);
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      className="tabbar fixed inset-x-3 bottom-0 z-40 mx-auto flex max-w-[456px] items-stretch justify-around rounded-[14px] border border-[var(--line)] p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,.8)] backdrop-blur-[14px] transition-transform duration-300 ease-out motion-reduce:transition-none"
      style={{
        marginBottom: "max(8px, var(--safe-bottom))",
        background: "rgba(26,26,26,.92)",
        transform: tucked ? "translateY(calc(100% + 16px + var(--safe-bottom)))" : undefined,
      }}
    >
      {TABS.map(({ href, labelKey, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={(e) => {
              // Tapping the tab you are already on did nothing — prod shows people tapping "Shop"
              // on the shop again and again. Like native apps, it now scrolls back to the top.
              if (pathname !== href) return;
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="tap relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
          >
            {active && (
              <motion.span
                layoutId="tab-highlight"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute left-1/2 top-[-5px] h-[2px] w-9 -translate-x-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_2px_rgba(255,102,0,.55)]"
              />
            )}
            <span
              key={href === "/cart" ? `cart-${bump}` : href}
              className={`relative z-10 ${href === "/cart" && bump > 0 ? "tab-bump" : ""}`}
            >
              <Icon
                className="h-5 w-5 transition-colors"
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
              className="font-display relative z-10 text-[10px] font-semibold uppercase leading-3 tracking-[0.08em] transition-colors"
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
