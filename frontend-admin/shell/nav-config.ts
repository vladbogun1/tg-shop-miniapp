/**
 * Навигация админки как данные: что в сайдбаре и tab-bar, какие вкладки у разделов, как называются
 * страницы в шапке, какие разделы свёрнуты по умолчанию. Вёрстка — в NavLinks / SectionTabs / TabBar,
 * счётчики — в use-nav-badges.
 */
import {
  LayoutDashboard,
  BarChart3,
  Package,
  Ticket,
  Users,
  Send,
  Truck,
  Languages,
  ScrollText,
  Settings,
  BellRing,
  Star,
  LifeBuoy,
  ClipboardCheck,
  Megaphone,
  PackagePlus,
  CreditCard,
  UsersRound,
  FolderTree,
  BadgeCheck,
  Sparkles,
  Gift,
  PackageMinus,
  Siren,
} from "lucide-react";

export type BadgeKey = "inbox" | "support" | "reviews" | "translations" | "cards" | "ai";

/** Вкладка раздела: отдельная страница со своим адресом, показанная строкой ссылок под шапкой. */
export interface NavTab {
  href: string;
  label: string;
  /** Иконка строки в палитре Ctrl+K; без неё — иконка пункта. */
  icon?: typeof BellRing;
  badge?: BadgeKey;
  superOnly?: boolean;
  /** Ещё адреса, на которых вкладка активна (реестр подарков — внутри «Кейса»). */
  also?: string[];
}
export interface NavItem {
  href: string;
  label: string;
  icon: typeof BellRing;
  exact?: boolean;
  badge?: BadgeKey;
  superOnly?: boolean;
  /** Страницы раздела; первая — адрес самого пункта. Бейдж пункта = сумма бейджей вкладок. */
  tabs?: NavTab[];
}
export interface NavSection {
  id: string;
  title: string;
  /** The section's icon on the collapsed rail. */
  icon: typeof BellRing;
  items: NavItem[];
}

/** The daily screens — always on top, no header: what needs an answer, orders, shipping (наложка), support. */
export const PRIMARY: NavItem[] = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: "inbox" },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/support", label: "Поддержка", icon: LifeBuoy, badge: "support" },
];

/** Everything else, by topic; each section folds (remembered per browser). */
export const SECTIONS: NavSection[] = [
  {
    id: "catalog",
    title: "Каталог",
    icon: Package,
    items: [
      {
        href: "/products",
        label: "Товары",
        icon: Package,
        tabs: [
          { href: "/products", label: "Товары" },
          { href: "/categories", label: "Категории", icon: FolderTree },
          { href: "/brands", label: "Бренды", icon: BadgeCheck },
        ],
      },
      { href: "/preorders", label: "Поставки", icon: PackagePlus },
      {
        href: "/cards",
        label: "Карточки",
        icon: ClipboardCheck,
        tabs: [
          { href: "/cards", label: "Карточки", badge: "cards" },
          { href: "/ai-tasks", label: "ИИ-задачи", icon: Sparkles, badge: "ai" },
        ],
      },
      {
        href: "/translations",
        label: "Переводы",
        icon: Languages,
        badge: "translations",
        // Тексты переводятся сами в фоне; ручная правка переводов — только у главного админа.
        superOnly: true,
      },
      { href: "/reviews", label: "Отзывы", icon: Star, badge: "reviews" },
    ],
  },
  {
    // id прежний (блок назывался «Клиенты»): по нему в браузере запомнено, свёрнут ли блок.
    id: "clients",
    title: "Маркетинг",
    icon: Megaphone,
    items: [
      { href: "/users", label: "Покупатели", icon: Users },
      { href: "/broadcasts", label: "Рассылки", icon: Send },
      {
        href: "/promocodes",
        label: "Акции",
        icon: Ticket,
        tabs: [
          { href: "/promocodes", label: "Промокоды" },
          { href: "/gift", label: "Кейс", icon: Gift, also: ["/gift/registry"] },
        ],
      },
    ],
  },
  {
    id: "stats",
    title: "Аналитика",
    icon: BarChart3,
    items: [
      {
        href: "/metrics",
        label: "Метрики",
        icon: BarChart3,
        tabs: [
          { href: "/metrics", label: "Метрики" },
          { href: "/writeoffs", label: "Списания", icon: PackageMinus },
        ],
      },
      {
        href: "/audit",
        label: "Журнал",
        icon: ScrollText,
        tabs: [
          { href: "/audit", label: "Действия" },
          { href: "/incidents", label: "Инциденты", icon: Siren, superOnly: true },
        ],
      },
    ],
  },
];

/** «Настройки» — внизу меню, рядом с «Мой аккаунт»; активны на /settings и всех /settings/*. */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "Настройки", icon: Settings };

/** Страницы без пункта в меню, которые находятся через Ctrl+K (группа «Настройки»). */
export const PALETTE_EXTRA: NavItem[] = [
  SETTINGS_ITEM,
  { href: "/settings/payment", label: "Оплата", icon: CreditCard },
  { href: "/settings/admins", label: "Админы", icon: UsersRound, superOnly: true },
];

/** Все блоки открыты: после варианта B они помещаются на ноутбуке. Сохранённое в браузере — главнее. */
export const DEFAULT_OPEN: Record<string, boolean> = {
  catalog: true,
  clients: true,
  stats: true,
};
// «.v2»: состав блоков сменился (вариант B), старая запомненная свёрнутость к ним не относится — все начинают с открытых.
export const OPEN_KEY = "admin.nav.sections.v2";

const TITLE: Record<string, string> = {
  "/inbox": "Внимание",
  "/": "Заказы",
  "/support": "Поддержка",
  "/dispatch": "Отправка",
  "/metrics": "Метрики",
  "/writeoffs": "Списания",
  "/users": "Покупатели",
  "/broadcasts": "Рассылки",
  "/products": "Товары",
  "/preorders": "Поставки",
  "/opening-cost": "Начальная себестоимость",
  "/reviews": "Отзывы",
  "/categories": "Категории",
  "/brands": "Бренды",
  "/promocodes": "Промокоды",
  "/gift": "Кейс",
  "/gift/registry": "Реестр подарков",
  "/payment": "Оплата",
  "/translations": "Переводы",
  "/cards": "Карточки",
  "/ai-tasks": "ИИ-задачи",
  "/audit": "Журнал",
  "/settings": "Настройки",
  "/settings/payment": "Оплата",
  "/settings/admins": "Админы",
  "/admins": "Админы",
  "/incidents": "Инциденты",
  "/account": "Мой аккаунт",
};

/** Заголовок по началу адреса, если точного нет; первое совпадение. */
const TITLE_BY_PREFIX: [string, string][] = [
  ["/cards/ai-review/", "Проверка ИИ"],
  ["/orders/", "Заказ"],
  ["/preorders/", "Поставка"],
  ["/settings/", "Настройки"],
];

/** Заголовок в шапке по адресу страницы. */
export function pageTitle(pathname: string): string {
  return TITLE[pathname] ?? TITLE_BY_PREFIX.find(([p]) => pathname.startsWith(p))?.[1] ?? "Панель";
}

/** Полноэкранные страницы без нижней навигации (проверка результата ИИ): внизу своя панель «Применить». */
export function isFullscreenPage(pathname: string): boolean {
  return pathname.startsWith("/cards/ai-review/");
}

const ALL_ITEMS: NavItem[] = SECTIONS.flatMap((s) => s.items);

/**
 * Страницы без своего пункта меню подсвечивают пункт, из которого в них приходят: вкладки — свой
 * пункт («Категории» → «Товары»), начальная себестоимость — «Метрики».
 */
const NAV_PARENT: Record<string, string> = {
  "/opening-cost": "/metrics",
  // Старые адреса, переехавшие в настройки (там редирект на /settings/payment и /settings/admins).
  "/payment": "/settings",
  "/admins": "/settings",
  ...Object.fromEntries(
    ALL_ITEMS.flatMap((item) =>
      (item.tabs ?? [])
        .flatMap((t) => [t.href, ...(t.also ?? [])])
        .filter((h) => h !== item.href)
        .map((h) => [h, item.href]),
    ),
  ),
};

function parentOf(pathname: string): string {
  const hit = Object.keys(NAV_PARENT).find((page) => pathname === page || pathname.startsWith(page + "/"));
  return hit ? NAV_PARENT[hit] : pathname;
}

export function isActive(pathname: string, href: string, exact?: boolean): boolean {
  const path = parentOf(pathname);
  if (exact) return path === href;
  return path === href || path.startsWith(href + "/");
}

/** Вкладки, видимые этому админу (superOnly — только главному). */
export function visibleTabs(item: NavItem, superAdmin: boolean | undefined): NavTab[] {
  return (item.tabs ?? []).filter((t) => !t.superOnly || superAdmin);
}

/** Ключи счётчиков пункта: свой или все видимые вкладки («Карточки» = карточки + ИИ-задачи). */
export function itemBadgeKeys(item: NavItem, superAdmin: boolean | undefined): BadgeKey[] {
  if (item.badge) return [item.badge];
  return visibleTabs(item, superAdmin).flatMap((t) => (t.badge ? [t.badge] : []));
}

/** Активная вкладка: точный адрес или один из `also`. */
export function isTabActive(pathname: string, tab: NavTab): boolean {
  return tab.href === pathname || !!tab.also?.includes(pathname);
}

/**
 * Пункт с вкладками, которому принадлежит открытая страница, — только по точному адресу вкладки
 * (или её `also`): на полноэкранной проверке ИИ /cards/ai-review/* строки вкладок нет.
 */
export function tabGroupFor(pathname: string): NavItem | undefined {
  if (isFullscreenPage(pathname)) return undefined;
  return ALL_ITEMS.find((item) => item.tabs?.some((t) => isTabActive(pathname, t)));
}

/** Daily screens on the phone's tab bar; everything else is under «Ещё». */
export const TABS = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: true },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/products", label: "Товары", icon: Package },
];
