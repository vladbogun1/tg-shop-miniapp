"use client";

/**
 * App shell — fixed sidebar (collapses to a drawer on mobile) + sticky top bar,
 * with an animated active-link indicator and page transitions.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
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
  MonitorX,
  Store,
  Truck,
  Languages,
  ScrollText,
  Settings,
  BellRing,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ApiError, logout, logoutEverywhere } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useInbox } from "@/lib/inbox";
import { useToast } from "@/lib/toast";
import { pendingCount, useTranslationStats } from "@/lib/translations";

const NAV = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: "inbox" as const },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/metrics", label: "Метрики", icon: BarChart3 },
  { href: "/users", label: "Пользователи", icon: Users },
  { href: "/broadcasts", label: "Рассылки", icon: Send },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/tags", label: "Теги", icon: Tags },
  { href: "/promocodes", label: "Промокоды", icon: Ticket },
  { href: "/payment", label: "Оплата", icon: CreditCard },
  { href: "/translations", label: "Переводы", icon: Languages, badge: "translations" as const },
  { href: "/audit", label: "Журнал", icon: ScrollText },
  { href: "/settings", label: "Настройки", icon: Settings },
];

const TITLE: Record<string, string> = {
  "/inbox": "Внимание",
  "/": "Заказы",
  "/dispatch": "Отправка",
  "/metrics": "Метрики",
  "/users": "Пользователи",
  "/broadcasts": "Рассылки",
  "/products": "Товары",
  "/tags": "Теги",
  "/promocodes": "Промокоды",
  "/payment": "Оплата",
  "/translations": "Переводы",
  "/audit": "Журнал",
  "/settings": "Настройки",
};

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // Fields × languages that need a translation (missing or stale), refreshed every 2 min and
  // right after imports on the «Переводы» screen.
  const { data: trStats } = useTranslationStats();
  const trPending = pendingCount(trStats);
  // Rows waiting on «Внимание» (same query as the bell, polled every 30 s).
  const { data: inbox } = useInbox();
  const inboxTotal = inbox?.total ?? 0;
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
            className={cn(
              "group relative flex items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-[14px] font-bold uppercase tracking-wide transition-colors",
              active
                ? "text-[var(--accent-ink)]"
                : "text-[var(--text)] hover:bg-[var(--surface-2)]"
            )}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
                className="absolute inset-0 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--accent)] shadow-[3px_3px_0_var(--shadow)]"
              />
            )}
            <Icon
              className={cn(
                "relative z-10 h-[18px] w-[18px] transition-colors",
                active ? "text-[var(--accent-ink)]" : "text-[var(--text-muted)] group-hover:text-[var(--text)]"
              )}
            />
            <span className="relative z-10">{item.label}</span>
            {"badge" in item && item.badge === "inbox" && inboxTotal > 0 && (
              <span
                aria-label={`Требует внимания: ${inboxTotal}`}
                className="relative z-10 ml-auto flex h-[20px] min-w-[20px] items-center justify-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--danger)] px-1 text-[10px] font-black leading-none text-[var(--accent-ink)]"
              >
                {inboxTotal > 99 ? "99+" : inboxTotal}
              </span>
            )}
            {"badge" in item && item.badge === "translations" && trPending > 0 && (
              <span
                aria-label={`Нужно перевести: ${trPending}`}
                title="Полей без актуального перевода (uk + en)"
                className="relative z-10 ml-auto flex h-[20px] min-w-[20px] items-center justify-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--c3)] px-1 text-[10px] font-black leading-none text-[var(--accent-ink)]"
              >
                {trPending > 999 ? "999+" : trPending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Revokes every token of this admin — for a lost phone or a session left open somewhere. */
function LogoutEverywhereButton() {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!window.confirm("Выйти на всех устройствах? Админку придётся открыть заново везде, включая это устройство.")) {
      return;
    }
    setBusy(true);
    try {
      await logoutEverywhere();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось выйти на всех устройствах", "error");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-faint)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger)] disabled:opacity-60"
    >
      <MonitorX className="h-[16px] w-[16px]" />
      Выйти на всех устройствах
    </button>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-7 flex items-center gap-3 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] p-3 shadow-[4px_4px_0_var(--shadow)]">
        <div className="accent-fill grid h-10 w-10 place-items-center rounded-[var(--r-md)]">
          <Store className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">MAXSOLCH</div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">tg-shop · админка</div>
        </div>
      </div>
      <NavLinks onNavigate={onNavigate} />
      <div className="mt-auto border-t-[3px] border-[var(--line)] pt-3">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3.5 py-2.5 text-[14px] font-bold uppercase tracking-wide text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger)]"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Выйти
        </button>
        <LogoutEverywhereButton />
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const title = TITLE[pathname] ?? "Панель";

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r-[3px] border-[var(--line)] bg-[var(--surface)] p-4 lg:flex">
        <SidebarInner />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/55 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r-[3px] border-[var(--line)] bg-[var(--surface)] p-4 shadow-[7px_0_0_var(--shadow)] lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
            >
              <button
                onClick={() => setDrawer(false)}
                className="nb-press mb-2 ml-auto grid h-9 w-9 place-items-center rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[3px_3px_0_var(--shadow)]"
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b-[3px] border-[var(--line)] bg-[var(--bg)] px-4 py-3 lg:px-7">
          <button
            onClick={() => setDrawer(true)}
            className="nb-press grid h-10 w-10 place-items-center rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] text-[var(--text)] shadow-[4px_4px_0_var(--shadow)] lg:hidden"
            aria-label="Меню"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">{title}</div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-7">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
