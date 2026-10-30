/**
 * Навигация админки как данные: что в сайдбаре и tab-bar, как называются страницы в шапке, какие
 * разделы свёрнуты по умолчанию. Вёрстка — в NavLinks / TabBar, счётчики — в use-nav-badges.
 */
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
  Truck,
  Languages,
  ScrollText,
  Settings,
  BellRing,
  UsersRound,
  Siren,
  Star,
  LifeBuoy,
  ClipboardCheck,
  PackageMinus,
  Gift,
  PackagePlus,
} from "lucide-react";

export type BadgeKey = "inbox" | "support" | "reviews" | "translations" | "cards";
export interface NavItem {
  href: string;
  label: string;
  icon: typeof BellRing;
  exact?: boolean;
  badge?: BadgeKey;
  superOnly?: boolean;
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
      { href: "/products", label: "Товары", icon: Package },
      { href: "/preorders", label: "Поставки", icon: PackagePlus },
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
      { href: "/gift", label: "Кейс", icon: Gift },
    ],
  },
  {
    id: "stats",
    title: "Аналитика",
    icon: BarChart3,
    items: [
      { href: "/metrics", label: "Метрики", icon: BarChart3 },
      { href: "/writeoffs", label: "Списания", icon: PackageMinus },
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
      { href: "/incidents", label: "Инциденты", icon: Siren, superOnly: true },
    ],
  },
];

/** Folded sections by default: the catalog is daily work, the rest is opened when needed. */
export const DEFAULT_OPEN: Record<string, boolean> = {
  catalog: true,
  clients: false,
  stats: false,
  system: false,
};
export const OPEN_KEY = "admin.nav.sections";

const TITLE: Record<string, string> = {
  "/inbox": "Внимание",
  "/": "Заказы",
  "/support": "Поддержка",
  "/dispatch": "Отправка",
  "/metrics": "Метрики",
  "/writeoffs": "Списания",
  "/users": "Пользователи",
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
  "/audit": "Журнал",
  "/settings": "Настройки",
  "/admins": "Админы",
  "/incidents": "Инциденты",
  "/account": "Мой аккаунт",
};

/** Заголовок в шапке по адресу страницы. */
export function pageTitle(pathname: string): string {
  return (
    TITLE[pathname] ??
    (pathname.startsWith("/orders/") ? "Заказ" : pathname.startsWith("/preorders/") ? "Поставка" : "Панель")
  );
}

export function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

/** Daily screens on the phone's tab bar; everything else is under «Ещё». */
export const TABS = [
  { href: "/inbox", label: "Внимание", icon: BellRing, badge: true },
  { href: "/", label: "Заказы", icon: LayoutDashboard, exact: true },
  { href: "/dispatch", label: "Отправка", icon: Truck },
  { href: "/products", label: "Товары", icon: Package },
];
