"use client";

/**
 * Bottom tab-bar — NEO-BRUTALISM: thick ink frame, hard shadow, active tab gets
 * a solid accent block. Магазин / Корзина / Аккаунт. Safe-area aware, ≥44px.
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

  if (pathname.includes("/chat")) return null;

  return (
    <nav
      className="nb nb-lg fixed inset-x-3 bottom-0 z-40 flex items-stretch justify-around p-1.5"
      style={{ marginBottom: "max(12px, var(--safe-bottom))" }}
    >
      {TABS.map(({ href, label, Icon }) => {
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
                className="absolute inset-0 border-[2.5px] border-[var(--line)] bg-[var(--accent)]"
              />
            )}
            <span className="relative z-10">
              <Icon
                className="h-5 w-5"
                strokeWidth={2.75}
                style={{ color: active ? "var(--accent-ink)" : "var(--ink)" }}
              />
              {href === "/cart" && cartCount > 0 && (
                <span className="absolute -right-2.5 -top-2 flex h-[18px] min-w-[18px] items-center justify-center border-[2px] border-[var(--line)] bg-[var(--c3)] px-1 text-[10px] font-black leading-none text-[var(--ink)]">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            <span
              className="relative z-10 text-[11px] font-bold uppercase tracking-wide"
              style={{ color: active ? "var(--accent-ink)" : "var(--ink)" }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
