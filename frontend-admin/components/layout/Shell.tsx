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
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppRuntime } from "@/components/pwa/AppRuntime";
import { InstallBanner, UpdateBanner } from "@/components/pwa/Banners";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { NotificationsBell } from "@/components/NotificationsBell";
import { LogoMark, Wordmark } from "@/components/brand/Logo";
import { accountApi, ApiError, logout, logoutEverywhere } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useInbox } from "@/lib/inbox";
import { useSupportUnread } from "@/lib/support-api";
import { useToast } from "@/lib/toast";
import { pendingCount, useTranslationStats } from "@/lib/translations";
import { pendingCards, useCardStats } from "@/lib/cards";

type BadgeKey = "inbox" | "support" | "reviews" | "translations" | "cards";
interface NavItem {
  href: string;
  label: string;
  icon: typeof BellRing;
  exact?: boolean;
  badge?: BadgeKey;
  superOnly?: boolean;
}
interface NavSection {
  id: string;
  title: string;
  /** The section's icon on the collapsed rail. */
  icon: typeof BellRing;
  items: NavItem[];
}

/** The daily screens — always on top, no header: what needs an answer, orders, shipping (наложка), support. */
const PRIMARY: NavItem[] = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: "inbox" },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/support", label: "Поддержка", icon: LifeBuoy, badge: "support" },
];

/** Everything else, by topic; each section folds (remembered per browser). */
const SECTIONS: NavSection[] = [
  {
    id: "catalog",
    title: "Каталог",
    icon: Package,
    items: [
      { href: "/products", label: "Товары", icon: Package },
      {
        href: "/cards",
        label: "Карточки",
        icon: ClipboardCheck,
        badge: "cards",
      },
      { href: "/categories", label: "Категории", icon: FolderTree },
      { href: "/brands", label: "Бренды", icon: BadgeCheck },
      {
        href: "/translations",
        label: "Переводы",
        icon: Languages,
        badge: "translations",
      },
      { href: "/reviews", label: "Отзывы", icon: Star, badge: "reviews" },
    ],
  },
  {
    id: "clients",
    title: "Клиенты",
    icon: Users,
    items: [
      { href: "/users", label: "Пользователи", icon: Users },
      { href: "/broadcasts", label: "Рассылки", icon: Send },
      { href: "/promocodes", label: "Промокоды", icon: Ticket },
    ],
  },
  {
    id: "stats",
    title: "Аналитика",
    icon: BarChart3,
    items: [
      { href: "/metrics", label: "Метрики", icon: BarChart3 },
      { href: "/audit", label: "Журнал", icon: ScrollText },
    ],
  },
  {
    id: "system",
    title: "Система",
    icon: Settings,
    items: [
      { href: "/payment", label: "Оплата", icon: CreditCard },
      { href: "/settings", label: "Настройки", icon: Settings },
      { href: "/admins", label: "Админы", icon: UsersRound, superOnly: true },
    ],
  },
];

/** Folded sections by default: the catalog is daily work, the rest is opened when needed. */
const DEFAULT_OPEN: Record<string, boolean> = {
  catalog: true,
  clients: false,
  stats: false,
  system: false,
};
const OPEN_KEY = "admin.nav.sections";

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
  const { data } = useQuery({
    queryKey: ["admin", "account"],
    queryFn: accountApi.get,
    staleTime: 60_000,
  });
  return data?.superAdmin;
}

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

interface BadgeInfo {
  count: number;
  label: string;
  title?: string;
  /** Orange (someone waits for an answer) vs muted (backlog). */
  strong: boolean;
}

/** Live counters of the menu, by badge key. */
function useNavBadges(): Record<BadgeKey, BadgeInfo> {
  // Texts that need a translation («Нужно перевести» + «Устарели»), every 2 min and after imports.
  const { data: trStats } = useTranslationStats();
  const trPending = pendingCount(trStats);
  // Cards waiting: «Оформить» + «Проверить» of «Карточки», every 2 min.
  const { data: cardStats } = useCardStats();
  const cardsPending = pendingCards(cardStats);
  // Rows waiting on «Внимание» (same query as the bell, polled every 30 s).
  const { data: inbox } = useInbox();
  const inboxTotal = inbox?.total ?? 0;
  // Reviews waiting for moderation — the «Отзывы на модерации» group of the same inbox answer.
  const reviewsPending =
    inbox?.groups.find((g) => g.id === "REVIEW")?.count ?? 0;
  // Support questions waiting for an answer (GET /api/admin/support/unread-count, every 30 s).
  const { data: supportUnread } = useSupportUnread();
  const supportWaiting = supportUnread?.count ?? 0;
  return {
    inbox: {
      count: inboxTotal,
      label: `Требует внимания: ${inboxTotal}`,
      strong: true,
    },
    support: {
      count: supportWaiting,
      label: `Ждут ответа в поддержке: ${supportWaiting}`,
      strong: true,
    },
    reviews: {
      count: reviewsPending,
      label: `Отзывов на модерации: ${reviewsPending}`,
      strong: false,
    },
    translations: {
      count: trPending,
      label: `Нужно перевести: ${trPending}`,
      title: "Тексты без актуального перевода: «Нужно перевести» + «Устарели»",
      strong: false,
    },
    cards: {
      count: cardsPending,
      label: `Карточек ждут оформления или проверки: ${cardsPending}`,
      title: "Карточки: «Оформить» + «Проверить»",
      strong: false,
    },
  };
}

const fmtCount = (n: number) => (n > 999 ? "999+" : String(n));

function NavRow({
  item,
  active,
  badge,
  collapsed,
  layoutScope,
  onNavigate,
  tabIndex,
}: {
  item: NavItem;
  active: boolean;
  badge?: BadgeInfo;
  collapsed: boolean;
  layoutScope: string;
  onNavigate?: () => void;
  tabIndex?: number;
}) {
  const Icon = item.icon;
  const showBadge = !!badge && badge.count > 0;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      tabIndex={tabIndex}
      title={collapsed ? item.label : badge?.title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-display group relative flex min-h-11 items-center gap-3 rounded-[var(--r-md)] text-[14px] font-semibold tracking-[0.01em] transition-colors lg:min-h-10",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
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
            active
              ? "text-[var(--accent)]"
              : "text-[var(--text-faint)] group-hover:text-[var(--text-muted)]",
          )}
          strokeWidth={active ? 2.25 : 2}
        />
        {/* Collapsed rail: the count shrinks to a dot on the icon. */}
        {collapsed && showBadge && (
          <span
            aria-hidden
            className={cn(
              "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]",
              badge.strong ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]",
            )}
          />
        )}
      </span>
      <span className={cn("truncate", collapsed && "sr-only")}>
        {item.label}
      </span>
      {showBadge && (
        <span
          aria-label={badge.label}
          className={cn(
            "count-badge ml-auto",
            !badge.strong && "count-badge--muted",
            collapsed && "sr-only",
          )}
        >
          {fmtCount(badge.count)}
        </span>
      )}
    </Link>
  );
}

/**
 * Collapsed rail: one icon per section instead of every item (20 icons did not fit the screen).
 * Hover (or click / Enter) opens a flyout to the right with the section's items, labels and counters;
 * it closes on leaving both, an outside press, Esc (overlay stack — not the page's modals) and on
 * navigation. The icon is highlighted when the open page lives in the section and carries a dot
 * when something in it waits.
 */
function RailSection({
  sec,
  items,
  badges,
  pathname,
  layoutScope,
  onNavigate,
}: {
  sec: NavSection;
  items: NavItem[];
  badges: Record<BadgeKey, BadgeInfo>;
  pathname: string;
  layoutScope: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = sec.icon;
  const hasActive = items.some((i) => isActive(pathname, i.href, i.exact));
  const pending = items.reduce(
    (n, i) => n + (i.badge ? badges[i.badge].count : 0),
    0,
  );
  const strong = items.some(
    (i) => i.badge && badges[i.badge].strong && badges[i.badge].count > 0,
  );
  const panelId = `rail-${layoutScope}-${sec.id}`;

  useOverlayLayer(open, () => setOpen(false), { lockScroll: false });

  const clearTimers = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
  };
  function show() {
    clearTimers();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.top, left: r.right + 10 });
    setOpen(true);
  }
  const hoverIn = () => {
    clearTimers();
    openTimer.current = setTimeout(show, 90);
  };
  const hoverOut = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), 220);
  };

  // Close on navigation and on a press outside the button and the flyout.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  useEffect(() => clearTimers, []);

  // Keep the flyout on screen: shift it up if the section's list would run past the bottom edge.
  useLayoutEffect(() => {
    if (!open || !pos || !panelRef.current) return;
    const h = panelRef.current.offsetHeight;
    const maxTop = window.innerHeight - h - 12;
    if (pos.top > maxTop) setPos({ ...pos, top: Math.max(12, maxTop) });
  }, [open, pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={hoverIn}
        onMouseLeave={hoverOut}
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${sec.title}${pending > 0 ? `, ждут: ${pending}` : ""}`}
        className={cn(
          "group relative flex min-h-10 w-full items-center justify-center rounded-[var(--r-md)] transition-colors",
          hasActive
            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
            : open
              ? "bg-[var(--surface-2)] text-[var(--text)]"
              : "text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)]",
        )}
      >
        {hasActive && (
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
          />
        )}
        <span className="relative">
          <Icon
            className="h-[18px] w-[18px]"
            strokeWidth={hasActive ? 2.25 : 2}
          />
          {pending > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute -right-1 -top-1 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]",
                strong ? "bg-[var(--accent)]" : "bg-[var(--text-muted)]",
              )}
            />
          )}
        </span>
        <ChevronRight
          aria-hidden
          className="absolute right-1 h-3 w-3 text-[var(--text-faint)] opacity-60"
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={sec.title}
            onMouseEnter={clearTimers}
            onMouseLeave={hoverOut}
            style={{ top: pos.top, left: pos.left }}
            className="rail-flyout fixed z-[160] w-[232px] rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-3)]"
          >
            <div className="font-display px-2.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              {sec.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href, item.exact)}
                  badge={item.badge ? badges[item.badge] : undefined}
                  collapsed={false}
                  layoutScope={`${layoutScope}-flyout`}
                  onNavigate={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Sidebar / drawer menu: the daily screens on top (no header), then folding sections by topic.
 * A folded section shows the sum of its counters next to the title; the section of the open page
 * is always unfolded. Active item: orange text + icon on a faint orange tint, with a 2px orange
 * indicator (glowing) on the left edge that slides between items. `collapsed` (desktop rail):
 * icons only, sections separated by hairlines — labels stay in the DOM as sr-only.
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
  const badges = useNavBadges();
  const superAdmin = useIsSuperAdmin();
  const [open, setOpen] = useState<Record<string, boolean>>(DEFAULT_OPEN);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "null");
      if (saved && typeof saved === "object")
        setOpen({ ...DEFAULT_OPEN, ...saved });
    } catch {
      /* private mode / bad JSON — defaults */
    }
  }, []);
  function toggle(id: string) {
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* private mode — not remembered */
      }
      return next;
    });
  }

  const row = (item: NavItem, hidden = false) => (
    <NavRow
      key={item.href}
      item={item}
      active={isActive(pathname, item.href, item.exact)}
      badge={item.badge ? badges[item.badge] : undefined}
      collapsed={collapsed}
      layoutScope={layoutScope}
      onNavigate={onNavigate}
      tabIndex={hidden ? -1 : undefined}
    />
  );

  return (
    <nav className={cn("flex flex-col", collapsed ? "gap-1" : "gap-0.5")}>
      {PRIMARY.map((i) => row(i))}
      {SECTIONS.map((sec) => {
        const items = sec.items.filter((i) => !i.superOnly || superAdmin);
        if (items.length === 0) return null;
        if (collapsed) {
          return (
            <div
              key={sec.id}
              className={cn(
                sec.id === SECTIONS[0].id &&
                  "mt-2 border-t border-[var(--line)] pt-2",
              )}
            >
              <RailSection
                sec={sec}
                items={items}
                badges={badges}
                pathname={pathname}
                layoutScope={layoutScope}
                onNavigate={onNavigate}
              />
            </div>
          );
        }
        const hasActive = items.some((i) =>
          isActive(pathname, i.href, i.exact),
        );
        const expanded = hasActive || !!open[sec.id];
        const pending = items.reduce(
          (n, i) => n + (i.badge ? badges[i.badge].count : 0),
          0,
        );
        const strong = items.some(
          (i) => i.badge && badges[i.badge].strong && badges[i.badge].count > 0,
        );
        const panelId = `nav-sec-${layoutScope}-${sec.id}`;
        return (
          <div key={sec.id} className="mt-3">
            <button
              type="button"
              onClick={() => !hasActive && toggle(sec.id)}
              aria-expanded={expanded}
              aria-controls={panelId}
              title={hasActive ? "Здесь открытая страница" : undefined}
              className={cn(
                "group/sec flex h-8 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-3 text-left transition-colors",
                hasActive ? "cursor-default" : "hover:bg-[var(--surface-2)]",
              )}
            >
              <span
                className={cn(
                  "font-display text-[10.5px] font-bold uppercase tracking-[0.18em] transition-colors",
                  hasActive
                    ? "text-[var(--text-muted)]"
                    : "text-[var(--text-faint)] group-hover/sec:text-[var(--text-muted)]",
                )}
              >
                {sec.title}
              </span>
              <span aria-hidden className="h-px flex-1 bg-[var(--line)]" />
              {!expanded && pending > 0 && (
                <span
                  aria-label={`В разделе ждут: ${pending}`}
                  className={cn(
                    "count-badge !h-[18px] !min-w-[18px] !text-[10.5px]",
                    !strong && "count-badge--muted",
                  )}
                >
                  {fmtCount(pending)}
                </span>
              )}
              {!hasActive && (
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-[var(--text-faint)] transition-transform duration-200",
                    expanded ? "rotate-0" : "-rotate-90",
                  )}
                />
              )}
            </button>
            {/* Plain CSS fold (grid-rows 0fr ↔ 1fr): no framer layout animations inside the drawer. */}
            <div
              id={panelId}
              inert={!expanded || undefined}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                expanded
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pt-0.5">
                {items.map((i) => row(i, !expanded))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** «Мой аккаунт» sits in the footer next to «Выйти» — it is about the admin, not the shop. */
function AccountLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, "/account");
  return (
    <Link
      href="/account"
      onClick={onNavigate}
      title={collapsed ? "Мой аккаунт" : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "font-display flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] py-2 text-[14px] font-semibold transition-colors lg:min-h-10",
        collapsed ? "justify-center px-0" : "px-3",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <UserRound
        className={cn(
          "h-[18px] w-[18px] shrink-0",
          active ? "text-[var(--accent)]" : "text-[var(--text-faint)]",
        )}
      />
      <span className={cn(collapsed && "sr-only")}>Мой аккаунт</span>
    </Link>
  );
}

/** Revokes every token of this admin — for a lost phone or a session left open somewhere. */
function LogoutEverywhereButton() {
  const collapsed = false;
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (
      !window.confirm(
        "Выйти на всех устройствах? Админку придётся открыть заново везде, включая это устройство.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await logoutEverywhere();
    } catch (e) {
      push(
        e instanceof ApiError
          ? e.message
          : "Не удалось выйти на всех устройствах",
        "error",
      );
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
        collapsed ? "justify-center px-0" : "px-3",
      )}
    >
      <MonitorX className="h-[16px] w-[16px] shrink-0" />
      <span className={cn(collapsed && "sr-only")}>
        Выйти на всех устройствах
      </span>
    </button>
  );
}

/** Brand block: compact vector wordmark + «ADMIN» eyebrow; the collapsed rail shows the CS mark. */
function Brand({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  if (collapsed) {
    return (
      <Link
        href="/"
        onClick={onNavigate}
        aria-label="ChiSetup Admin — на главную"
        className="mx-auto grid place-items-center rounded-[var(--r-md)]"
      >
        <LogoMark size={38} />
      </Link>
    );
  }
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="ChiSetup Admin — на главную"
      className="group flex flex-col items-start gap-1.5 rounded-[var(--r-md)] px-1 py-1"
    >
      <Wordmark
        size={21}
        className="transition-[filter] duration-150 group-hover:[filter:drop-shadow(0_0_10px_rgba(255,102,0,.35))]"
      />
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-[2px] w-5 rounded-full bg-[var(--accent)] shadow-[var(--glow-sm)]"
        />
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
      <div
        className={cn(
          "flex items-center",
          collapsed ? "mb-4 justify-center" : "mb-6 px-2 pt-1",
        )}
      >
        <Brand collapsed={collapsed} onNavigate={onNavigate} />
      </div>
      <NavLinks
        onNavigate={onNavigate}
        collapsed={collapsed}
        layoutScope={layoutScope}
      />
      <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--line)] pt-3">
        <AccountLink collapsed={collapsed} onNavigate={onNavigate} />
        <button
          onClick={logout}
          title={collapsed ? "Выйти" : undefined}
          className={cn(
            "font-display flex min-h-11 w-full items-center gap-3 rounded-[var(--r-md)] py-2 text-[14px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-[var(--danger-ink)] lg:min-h-10",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span className={cn(collapsed && "sr-only")}>Выйти</span>
        </button>
        {!collapsed && <LogoutEverywhereButton />}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
            className={cn(
              "mt-1 flex h-9 items-center gap-3 rounded-[var(--r-md)] text-[12.5px] text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[16px] w-[16px]" />
            ) : (
              <PanelLeftClose className="h-[16px] w-[16px]" />
            )}
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
  return (
    <span className="relative grid h-7 w-10 place-items-center">
      {children}
    </span>
  );
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

function TabBar({
  menuOpen,
  onMenu,
}: {
  menuOpen: boolean;
  onMenu: () => void;
}) {
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
      style={{
        paddingBottom: "var(--safe-bottom)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}
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
              className={cn(
                TAB_CELL,
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
              )}
            >
              {active && <TabIndicator />}
              <TabIcon>
                <Icon
                  className="h-[21px] w-[21px]"
                  strokeWidth={active ? 2.25 : 2}
                />
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
          className={cn(
            TAB_CELL,
            moreActive ? "text-[var(--accent)]" : "text-[var(--text-muted)]",
          )}
        >
          {moreActive && <TabIndicator />}
          <TabIcon>
            <Menu
              className="h-[21px] w-[21px]"
              strokeWidth={moreActive ? 2.25 : 2}
            />
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
  const title =
    TITLE[pathname] ?? (pathname.startsWith("/orders/") ? "Заказ" : "Панель");

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
          collapsed ? "w-[76px]" : "w-[248px]",
        )}
      >
        <SidebarInner
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          layoutScope="sidebar"
        />
      </aside>

      {/* Phone: the full menu («Ещё»). Always mounted and driven by `animate` rather than
          AnimatePresence: an exit that never finished (route change mid-animation on iOS/Android)
          used to leave the invisible full-screen backdrop on top, and no tap reached the app. Now
          the closed state is pointer-events:none + inert regardless of where the animation is. */}
      <motion.div
        aria-hidden
        className={cn(
          "fixed inset-0 z-[70] bg-black/60 backdrop-blur-[6px] lg:hidden",
          !drawer && "pointer-events-none",
        )}
        initial={false}
        animate={
          drawer
            ? { opacity: 1, visibility: "visible" }
            : { opacity: 0, transitionEnd: { visibility: "hidden" } }
        }
        transition={{ duration: 0.2 }}
        onClick={() => setDrawer(false)}
      />
      <motion.aside
        aria-label="Все разделы"
        aria-hidden={!drawer}
        inert={!drawer}
        className={cn(
          "thin-scroll fixed inset-y-0 left-0 z-[80] flex w-[min(20rem,86vw)] flex-col overflow-y-auto rounded-r-[var(--r-xl)] border-r border-[var(--line-strong)] bg-[var(--surface)] pr-3 shadow-[var(--shadow-3)] lg:hidden",
          !drawer && "pointer-events-none",
        )}
        style={{
          paddingTop: "calc(12px + var(--safe-top))",
          paddingBottom: "calc(16px + var(--safe-bottom))",
          paddingLeft: "calc(12px + var(--safe-left))",
        }}
        initial={false}
        animate={
          drawer
            ? { x: 0, visibility: "visible" }
            : { x: "-105%", transitionEnd: { visibility: "hidden" } }
        }
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
      >
        <button
          onClick={() => setDrawer(false)}
          className="nb-press mb-1 ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
          aria-label="Закрыть меню"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarInner
          onNavigate={() => setDrawer(false)}
          layoutScope="drawer"
        />
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
