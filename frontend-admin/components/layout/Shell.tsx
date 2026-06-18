"use client";

/**
 * App shell (design doc §8bis.2): glass sidebar (collapses to drawer on
 * mobile via hamburger) + sticky top bar. Desktop-first.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  KanbanSquare,
  BarChart3,
  Package,
  Tags,
  Ticket,
  CreditCard,
  Users,
  Send,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { logout } from "@/lib/api";

const NAV = [
  { href: "/", label: "Заказы", icon: KanbanSquare, exact: true },
  { href: "/metrics", label: "Метрики", icon: BarChart3 },
  { href: "/users", label: "Пользователи", icon: Users },
  { href: "/broadcasts", label: "Рассылки", icon: Send },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/tags", label: "Теги", icon: Tags },
  { href: "/promocodes", label: "Промокоды", icon: Ticket },
  { href: "/payment", label: "Оплата", icon: CreditCard },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-[14px] font-medium transition-colors ${
              active
                ? "glossy"
                : "text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <div className="glossy grid h-9 w-9 place-items-center rounded-[var(--r-md)]">
          <KanbanSquare className="h-5 w-5 text-[var(--accent-ink)]" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold text-[var(--text)]">tg-shop</div>
          <div className="text-[11px] text-[var(--text-faint)]">админка</div>
        </div>
      </div>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto pt-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-[14px] font-medium text-[var(--text-muted)] transition-colors hover:bg-white/10 hover:text-[var(--danger)]"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Выйти
        </button>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-dvh w-64 shrink-0 flex-col rounded-none p-4 lg:flex">
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="glass glass--strong fixed inset-y-0 left-0 z-50 w-72 rounded-none p-4 lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
            >
              <button
                onClick={() => setDrawer(false)}
                className="mb-2 ml-auto grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] hover:bg-white/10"
                aria-label="Закрыть меню"
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarInner onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="glass sticky top-0 z-30 flex items-center gap-3 rounded-none px-4 py-3 lg:px-6">
          <button
            onClick={() => setDrawer(true)}
            className="grid h-10 w-10 place-items-center rounded-[var(--r-md)] text-[var(--text)] hover:bg-white/10 lg:hidden"
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-[15px] font-semibold text-[var(--text)]">
            Панель управления
          </div>
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
