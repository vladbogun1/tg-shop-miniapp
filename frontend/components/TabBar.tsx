"use client";

/**
 * Bottom glass tab-bar (design doc §8.4 / §8bis.1): Магазин / Корзина / Аккаунт.
 * Active tab uses a "liquid" morphing highlight (Framer Motion layoutId).
 * Mobile-first, safe-area aware, touch targets >=44px.
 */
import { motion } from "framer-motion";
import { ShoppingBag, ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCartCount } from "@/lib/cart";

const TABS = [
  { href: "/", label: "Магазин", Icon: ShoppingBag },
  { href: "/cart", label: "Корзина", Icon: ShoppingCart },
  { href: "/account", label: "Аккаунт", Icon: User },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const cartCount = useCartCount();

  // Hide on full-screen order chat (its own fixed layout + composer).
  if (pathname.includes("/chat")) return null;

  return (
    <nav
      className="glass glass--strong glass--floating fixed inset-x-3 bottom-0 z-40 mb-[max(12px,var(--safe-bottom))] flex items-stretch justify-around rounded-[var(--r-lg)] p-1.5"
      style={{ marginBottom: "max(12px, var(--safe-bottom))" }}
    >
      {TABS.map(({ href, label, Icon }) => {
        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="tap relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] py-1.5"
          >
            {active && (
              <motion.span
                layoutId="tab-highlight"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-[var(--r-md)] [background:color-mix(in_srgb,var(--accent)_22%,transparent)]"
              />
            )}
            <span className="relative z-10">
              <Icon
                className="h-5 w-5"
                style={{
                  color: active ? "var(--accent)" : "var(--text-muted)",
                }}
              />
              {href === "/cart" && cartCount > 0 && (
                <span className="glossy absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            <span
              className="relative z-10 text-[11px] font-medium"
              style={{
                color: active ? "var(--text)" : "var(--text-muted)",
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
