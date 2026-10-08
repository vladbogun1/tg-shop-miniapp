"use client";

/**
 * App shell.
 *  - Desktop (lg+): fixed sidebar + sticky top bar.
 *  - Phone: sticky top bar (under the status bar in the installed app — safe-area padded) and a
 *    bottom tab bar for the daily screens: Внимание · Заказы · Отправка · Товары · Ещё. «Ещё»
 *    opens the full menu drawer with everything else.
 * Animated active indicators and page transitions on both. ChiSetup v3 look (DESIGN-V3 §8):
 * graphite chrome, hairlines, active item = orange text/icon + 2px glowing orange indicator.
 * The desktop sidebar collapses to an icon rail (CS mark on top), remembered per browser.
 */
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BarChart3,
  Package,
  FolderTree,
  BadgeCheck,
  Ticket,
  CreditCard,
  Users,
  Send,
  Menu,
  X,
  LogOut,
  MonitorX,
  PanelLeftClose,
  PanelLeftOpen,
  Truck,
  Languages,
  ScrollText,
  Settings,
  BellRing,
  UserRound,
  UsersRound,
  Star,
  LifeBuoy,
  ClipboardCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppRuntime } from "@/components/pwa/AppRuntime";
import { InstallBanner, UpdateBanner } from "@/components/pwa/Banners";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { accountApi, ApiError, logout, logoutEverywhere } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useInbox } from "@/lib/inbox";
import { useSupportUnread } from "@/lib/support-api";
import { useToast } from "@/lib/toast";
import { pendingCount, useTranslationStats } from "@/lib/translations";
import { pendingCards, useCardStats } from "@/lib/cards";

const NAV = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: "inbox" as const },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/support", label: "Поддержка", icon: LifeBuoy, badge: "support" as const },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/metrics", label: "Метрики", icon: BarChart3 },
  { href: "/users", label: "Пользователи", icon: Users },
  { href: "/broadcasts", label: "Рассылки", icon: Send },
  { href: "/products", label: "Товары", icon: Package },
  { href: "/reviews", label: "Отзывы", icon: Star, badge: "reviews" as const },
  { href: "/categories", label: "Категории", icon: FolderTree },
  { href: "/brands", label: "Бренды", icon: BadgeCheck },
  { href: "/promocodes", label: "Промокоды", icon: Ticket },
  { href: "/payment", label: "Оплата", icon: CreditCard },
  { href: "/translations", label: "Переводы", icon: Languages, badge: "translations" as const },
  { href: "/cards", label: "Карточки", icon: ClipboardCheck, badge: "cards" as const },
  { href: "/audit", label: "Журнал", icon: ScrollText },
  { href: "/settings", label: "Настройки", icon: Settings },
  { href: "/admins", label: "Админы", icon: UsersRound, superOnly: true },
  { href: "/account", label: "Мой аккаунт", icon: UserRound },
];

const TITLE: Record<string, string> = {
  "/inbox": "Внимание",
  "/": "Заказы",
  "/support": "Поддержка",
  "/dispatch": "Отправка",
  "/metrics": "Метрики",
  "/users": "Пользователи",
  "/broadcasts": "Рассылки",
  "/products": "Товары",
  "/reviews": "Отзывы",
  "/categories": "Категории",
  "/brands": "Бренды",
  "/promocodes": "Промокоды",
  "/payment": "Оплата",
  "/translations": "Переводы",
  "/cards": "Карточки",
  "/audit": "Журнал",
  "/settings": "Настройки",
  "/admins": "Админы",
  "/account": "Мой аккаунт",
};

/**
 * Is the signed-in admin the main one (SUPER_ADMIN)? Same query as «Мой аккаунт». Hides «Админы»
 * for everyone else — the backend answers 403 there anyway.
 */
export function useIsSuperAdmin(): boolean | undefined {
  const { data } = useQuery({ queryKey: ["admin", "account"], queryFn: accountApi.get, staleTime: 60_000 });
  return data?.superAdmin;
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Sidebar / drawer menu. Active item: orange text + icon on a faint orange tint, with a 2px orange
 * indicator (glowing) on the left edge that slides between items. `collapsed` (desktop rail):
 * icons only — the label stays in the DOM as sr-only, so the link keeps its accessible name.
 */
function NavLinks({
  onNavigate,
  collapsed = false,
  layoutScope,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  layoutScope: string;
}) {
  const pathname = usePathname();
  // Fields × languages that need a translation (missing or stale), refreshed every 2 min and
  // right after imports on the «Переводы» screen.
  const { data: trStats } = useTranslationStats();
  const trPending = pendingCount(trStats);
  // Cards waiting: hidden unfinished products + filled by the AI but not reviewed («Карточки»), every 2 min.
  const { data: cardStats } = useCardStats();
  const cardsPending = pendingCards(cardStats);
  // Rows waiting on «Внимание» (same query as the bell, polled every 30 s).
  const { data: inbox } = useInbox();
  const inboxTotal = inbox?.total ?? 0;
  // Reviews waiting for moderation — the «Отзывы на модерации» group of the same inbox answer.
  const reviewsPending = inbox?.groups.find((g) => g.id === "REVIEW")?.count ?? 0;
  // Support questions waiting for an answer (GET /api/admin/support/unread-count, every 30 s).
  const { data: supportUnread } = useSupportUnread();
  const supportWaiting = supportUnread?.count ?? 0;
  const superAdmin = useIsSuperAdmin();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.filter((item) => !("superOnly" in item) || superAdmin).map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        const Icon = item.icon;
        const inboxBadge = "badge" in item && item.badge === "inbox" && inboxTotal > 0;
        const trBadge = "badge" in item && item.badge === "translations" && trPending > 0;
        const cardsBadge = "badge" in item && item.badge === "cards" && cardsPending > 0;
        const reviewsBadge = "badge" in item && item.badge === "reviews" && reviewsPending > 0;
        const supportBadge = "badge" in item && item.badge === "support" && supportWaiting > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "font-display group relative flex min-h-11 items-center gap-3 rounded-[var(--r-md)] text-[14px] font-semibold tracking-[0.01em] transition-colors lg:min-h-10",
              collapsed ? "justify-center px-0" : "px-3",
              active
                ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            )}
          >
            {active && (
              <motion.span
                layoutId={`nav-active-${layoutScope}`}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
              />
            )}
            <span className="relative">
              <Icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  active ? "text-[var(--accent)]" : "text-[var(--text-faint)] group-hover:text-[var(--text-muted)]"
                )}
                strokeWidth={active ? 2.25 : 2}
              />
              {/* Collapsed rail: the count shrinks to a dot on the icon. */}
              {collapsed && (inboxBadge || trBadge || cardsBadge || supportBadge) && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]",
                    inboxBadge || supportBadge ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]"
                  )}
                />
              )}
            </span>
            <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
            {inboxBadge && (
              <span aria-label={`Требует внимания: ${inboxTotal}`} className={cn("count-badge ml-auto", collapsed && "sr-only")}>
                {inboxTotal > 99 ? "99+" : inboxTotal}
              </span>
            )}
            {trBadge && (
              <span
                aria-label={`Нужно перевести: ${trPending}`}
                title="Полей без актуального перевода (uk + en)"
                className={cn("count-badge count-badge--muted ml-auto", collapsed && "sr-only")}
              >
                {trPending > 999 ? "999+" : trPending}
              </span>
            )}
            {cardsBadge && (
              <span
                aria-label={`Карточек ждут завершения или проверки: ${cardsPending}`}
                title="Незавершённые (скрытые) + заполненные ИИ, но не проверенные"
                className={cn("count-badge count-badge--muted ml-auto", collapsed && "sr-only")}
              >
                {cardsPending > 999 ? "999+" : cardsPending}
              </span>
            )}
            {reviewsBadge && (
              <span
                aria-label={`Отзывов на модерации: ${reviewsPending}`}
                className={cn("count-badge count-badge--muted ml-auto", collapsed && "sr-only")}
              >
                {reviewsPending > 99 ? "99+" : reviewsPending}
              </span>
            )}
            {supportBadge && (
              <span aria-label={`Ждут ответа в поддержке: ${supportWaiting}`} className={cn("count-badge ml-auto", collapsed && "sr-only")}>
                {supportWaiting > 99 ? "99+" : supportWaiting}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Revokes every token of this admin — for a lost phone or a session left open somewhere. */
function LogoutEverywhereButton({ collapsed = false }: { collapsed?: boolean }) {
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
      title={collapsed ? "Выйти на всех устройствах" : undefined}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] py-2 text-[12.5px] font-medium text-[var(--text-faint)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger-ink)] disabled:opacity-60 lg:min-h-9",
        collapsed ? "justify-center px-0" : "px-3"
      )}
    >
      <MonitorX className="h-[16px] w-[16px] shrink-0" />
      <span className={cn(collapsed && "sr-only")}>Выйти на всех устройствах</span>
    </button>
  );
}

/** Brand block: compact vector wordmark + «ADMIN» eyebrow; the collapsed rail shows the CS mark. */
function Brand({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  if (collapsed) {
    return (
      <Link href="/" onClick={onNavigate} aria-label="ChiSetup Admin — на главную" className="mx-auto grid place-items-center rounded-[var(--r-md)]">
        <LogoMark size={38} />
      </Link>
    );
  }
  return (
    <Link href="/" onClick={onNavigate} aria-label="ChiSetup Admin — на главную" className="group flex flex-col items-start gap-1.5 rounded-[var(--r-md)] px-1 py-1">
      <Wordmark size={21} className="transition-[filter] duration-150 group-hover:[filter:drop-shadow(0_0_10px_rgba(255,102,0,.35))]" />
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-[2px] w-5 rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]" />
        <span className="eyebrow !text-[10px] !tracking-[0.34em]">Admin</span>
      </span>
    </Link>
  );
}

function SidebarInner({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
  layoutScope,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Desktop sidebar and phone menu are both mounted — each needs its own sliding indicator. */
  layoutScope: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("mb-6 flex items-center", collapsed ? "justify-center" : "px-2 pt-1")}>
        <Brand collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <NavLinks onNavigate={onNavigate} collapsed={collapsed} layoutScope={layoutScope} />
      <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--line)] pt-3">
        <button
          onClick={logout}
          title={collapsed ? "Выйти" : undefined}
          className={cn(
            "font-display flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] py-2 text-[14px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger-ink)] lg:min-h-10",
            collapsed ? "justify-center px-0" : "px-3"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span className={cn(collapsed && "sr-only")}>Выйти</span>
        </button>
        <LogoutEverywhereButton collapsed={collapsed} />
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className={cn(
              "mt-1 flex h-9 items-center gap-3 rounded-[var(--r-md)] text-[12.5px] text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              collapsed ? "justify-center px-0" : "px-3"
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-[16px] w-[16px]" /> : <PanelLeftClose className="h-[16px] w-[16px]" />}
            {!collapsed && <span>Свернуть</span>}
          </button>
        )}
      </div>
    </div>
  );
}

/** Daily screens on the phone's tab bar; everything else is under «Ещё». */
const TABS = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: true },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/products", label: "Товары", icon: Package },
];

const TAB_CELL =
  "font-display relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1 text-[10.5px] font-semibold uppercase leading-none tracking-[0.06em] transition-colors";

/** Tab icon box; the active colour comes from the cell (orange icon + label). */
function TabIcon({ children }: { children: ReactNode }) {
  return <span className="relative grid h-7 w-10 place-items-center">{children}</span>;
}

/** 2px glowing orange bar on the top edge of the active tab (as in the Mini App), slides between tabs. */
function TabIndicator() {
  return (
    <motion.span
      layoutId="tab-active"
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="absolute left-1/2 top-0 h-[2px] w-9 -translate-x-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_10px_2px_rgba(255,102,0,.55)]"
    />
  );
}

function TabBar({ menuOpen, onMenu }: { menuOpen: boolean; onMenu: () => void }) {
  const pathname = usePathname();
  const { data: inbox } = useInbox();
  const inboxTotal = inbox?.total ?? 0;
  const onTab = TABS.some((t) => isActive(pathname, t.href, t.exact));
  const moreActive = menuOpen || !onTab;

  return (
    <nav
      aria-label="Главные разделы"
      data-app-chrome
      className="tabbar fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--line)] bg-[rgba(26,26,26,.92)] backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "var(--safe-bottom)", paddingLeft: "var(--safe-left)", paddingRight: "var(--safe-right)" }}
    >
      <div className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch">
        {TABS.map((t) => {
          const active = !menuOpen && isActive(pathname, t.href, t.exact);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(TAB_CELL, active ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}
            >
              {active && <TabIndicator />}
              <TabIcon>
                <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.25 : 2} />
                {t.badge && inboxTotal > 0 && (
                  <span
                    aria-label={`Требует внимания: ${inboxTotal}`}
                    className="count-badge absolute -right-1 -top-1.5 ring-2 ring-[#1A1A1A]"
                  >
                    {inboxTotal > 99 ? "99+" : inboxTotal}
                  </span>
                )}
              </TabIcon>
              <span className="max-w-full truncate px-0.5">{t.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMenu}
          aria-label="Ещё — все разделы"
          aria-expanded={menuOpen}
          className={cn(TAB_CELL, moreActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}
        >
          {moreActive && <TabIndicator />}
          <TabIcon>
            <Menu className="h-[21px] w-[21px]" strokeWidth={moreActive ? 2.25 : 2} />
          </TabIcon>
          <span>Ещё</span>
        </button>
      </div>
    </nav>
  );
}

const COLLAPSE_KEY = "admin-sidebar-collapsed";

/** Desktop rail state, remembered per browser (a convenience — falls back to expanded). */
function useCollapsedSidebar(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage blocked — stay expanded */
    }
  }, []);
  function toggle() {
    setCollapsed((v) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
  return [collapsed, toggle];
}

export function Shell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsedSidebar();
  const pathname = usePathname();
  const title = TITLE[pathname] ?? (pathname.startsWith("/orders/") ? "Заказ" : "Панель");

  // Any navigation (menu link, system back, a tapped notification) closes the menu.
  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

  return (
    <div className="flex min-h-dvh">
      <AppRuntime />

      {/* Desktop sidebar (icon rail when collapsed) */}
      <aside
        className={cn(
          "thin-scroll sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] px-3 py-5 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[248px]"
        )}
      >
        <SidebarInner collapsed={collapsed} onToggleCollapsed={toggleCollapsed} layoutScope="sidebar" />
      </aside>

      {/* Phone: the full menu («Ещё»). Always mounted and driven by `animate` rather than
          AnimatePresence: an exit that never finished (route change mid-animation on iOS/Android)
          used to leave the invisible full-screen backdrop on top, and no tap reached the app. Now
          the closed state is pointer-events:none + inert regardless of where the animation is. */}
      <motion.div
        aria-hidden
        className={cn(
          "fixed inset-0 z-[70] bg-black/60 backdrop-blur-[6px] lg:hidden",
          !drawer && "pointer-events-none"
        )}
        initial={false}
        animate={drawer ? { opacity: 1, visibility: "visible" } : { opacity: 0, transitionEnd: { visibility: "hidden" } }}
        transition={{ duration: 0.2 }}
        onClick={() => setDrawer(false)}
      />
      <motion.aside
        aria-label="Все разделы"
        aria-hidden={!drawer}
        inert={!drawer}
        className={cn(
          "thin-scroll fixed inset-y-0 left-0 z-[80] flex w-[min(20rem,86vw)] flex-col overflow-y-auto rounded-r-[var(--r-xl)] border-r border-[var(--line-strong)] bg-[var(--surface)] pr-3 shadow-[var(--shadow-3)] lg:hidden",
          !drawer && "pointer-events-none"
        )}
        style={{
          paddingTop: "calc(12px + var(--safe-top))",
          paddingBottom: "calc(16px + var(--safe-bottom))",
          paddingLeft: "calc(12px + var(--safe-left))",
        }}
        initial={false}
        animate={drawer ? { x: 0, visibility: "visible" } : { x: "-105%", transitionEnd: { visibility: "hidden" } }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
      >
        <button
          onClick={() => setDrawer(false)}
          className="nb-press mb-1 ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
          aria-label="Закрыть меню"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarInner onNavigate={() => setDrawer(false)} layoutScope="drawer" />
      </motion.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — on a phone it sits under the status bar of the installed app */}
        <header
          data-app-chrome
          className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--line)] bg-[rgba(14,14,16,.85)] pb-2.5 pl-[max(16px,var(--safe-left))] pr-[max(16px,var(--safe-right))] pt-[calc(10px+var(--safe-top))] backdrop-blur-md lg:min-h-[61px] lg:px-7 lg:py-2.5"
        >
          <LogoMark size={28} className="lg:hidden" />
          <div className="font-display min-w-0 truncate text-[16px] font-bold uppercase tracking-[0.06em] text-[var(--text)] lg:text-[13px] lg:font-semibold lg:tracking-[0.2em] lg:text-[var(--text-muted)]">
            {title}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            {/* On a phone the «Внимание» tab carries the same badge — no second bell there. */}
            <div className="hidden lg:block">
              <NotificationsBell />
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-[calc(var(--bottom-nav)+20px)] pl-[max(16px,var(--safe-left))] pr-[max(16px,var(--safe-right))] pt-4 lg:p-7">
          <InstallBanner />
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

      <TabBar menuOpen={drawer} onMenu={() => setDrawer((v) => !v)} />
      <UpdateBanner />
    </div>
  );
}
