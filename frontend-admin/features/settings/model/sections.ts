/**
 * Разделы настроек (/settings/<раздел>) — данными: какой раздел из каких групп бэкенда и панелей состоит.
 * Новая группа с бэкенда, которой здесь нет, попадает в «Прочее» (виден, только если такие группы есть) —
 * так она не пропадёт молча. Раздел без групп и без панелей скрыт (например «ИИ» без доступа к финансам).
 */
import {
  Bot,
  Boxes,
  CreditCard,
  Gift,
  Globe,
  LifeBuoy,
  type LucideIcon,
  Server,
  SlidersHorizontal,
  Sparkles,
  Star,
  Ticket,
  Truck,
  UsersRound,
} from "lucide-react";

/** Панели, которые живут в разделе рядом с полями настроек (или вместо них). */
export type SectionPanel = "payment-methods" | "np" | "gift-link" | "site" | "admins" | "system";

export type SectionBlock = "shop" | "team";

export interface SettingsSection {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  /** id групп бэкенда (`SettingGroup.id`) — в этом порядке на странице. */
  groups: readonly string[];
  panels: readonly SectionPanel[];
  /** Только главному админу (SUPER_ADMIN). */
  superOnly?: boolean;
  /** Широкая таблица: меню разделов слева — только от 1536 px, уже — ссылка «← Настройки», чтобы таблица не прокручивалась вбок. */
  wide?: boolean;
  block: SectionBlock;
}

export const BLOCK_TITLE: Record<SectionBlock, string> = { shop: "Магазин", team: "Команда и система" };

/** Группы бэкенда, которые нужны экрану по имени. */
export const NP_GROUP = "novaposhta";
export const AI_GROUP_ID = "ai";
export const GIFT_GROUP = "gift";
export const PAYMENT_GROUP = "payment";
/** `PreorderSettings.PREORDER_GROUP`, `ProcurementSettings.COSTING_GROUP`. */
const PREORDER_GROUP = "preorder";
const COSTING_GROUP = "costing";

export const OTHER_SECTION = "other";

export const SECTIONS: readonly SettingsSection[] = [
  {
    id: "payment",
    title: "Оплата",
    icon: CreditCard,
    description: "Как покупатель платит: способы оплаты в чекауте, оплата при получении, monobank и фискальные чеки.",
    groups: [PAYMENT_GROUP],
    panels: ["payment-methods"],
    block: "shop",
  },
  {
    id: "delivery",
    title: "Доставка",
    icon: Truck,
    description: "Новая Почта: что видит покупатель в чекауте, как создаются ТТН, коробки и как следим за посылкой.",
    groups: [NP_GROUP],
    panels: ["np"],
    block: "shop",
  },
  {
    id: "orders",
    title: "Заказы",
    icon: Ticket,
    description: "Когда заказ считается застрявшим, лимиты от спама, ожидание товара и резерв промокода в корзине.",
    groups: ["inbox", "antibot", PREORDER_GROUP, "orders"],
    panels: [],
    block: "shop",
  },
  {
    id: "stock",
    title: "Склад и маржа",
    icon: Boxes,
    description: "Пороги остатков и как считается себестоимость поставок.",
    groups: ["stock", COSTING_GROUP],
    panels: [],
    block: "shop",
  },
  {
    id: "bot",
    title: "Бот и сообщения",
    icon: Bot,
    description: "Что покупатель видит в Telegram: приветствие и уведомления о заказе.",
    groups: ["bot", "notifications"],
    panels: [],
    block: "shop",
  },
  {
    id: "reviews",
    title: "Отзывы",
    icon: Star,
    description: "Модерация, бонус за отзыв и напоминания покупателю.",
    groups: ["reviews"],
    panels: [],
    block: "shop",
  },
  {
    id: "support",
    title: "Поддержка",
    icon: LifeBuoy,
    description: "Чат с покупателями на сайте: лимиты и автозакрытие.",
    groups: ["support"],
    panels: [],
    block: "shop",
  },
  {
    id: "ai",
    title: "ИИ",
    icon: Sparkles,
    description: "Выключатели функций, лимиты расходов, поиск и предупреждения.",
    groups: [AI_GROUP_ID],
    panels: [],
    block: "shop",
  },
  {
    id: "gift",
    title: "Кейс и подарки",
    icon: Gift,
    description: "Подарок за сумму и кейсы настраиваются в разделе «Кейс» вместе с призами.",
    groups: [],
    panels: ["gift-link"],
    block: "shop",
  },
  {
    id: "site",
    title: "Сайт",
    icon: Globe,
    description: "Сайт обновляет страницы сам; кнопка — если нужно сразу.",
    groups: [],
    panels: ["site"],
    block: "shop",
  },
  {
    id: "admins",
    title: "Админы",
    icon: UsersRound,
    description: "Кто входит в админку, роли и 2FA. Только для главного админа.",
    groups: [],
    panels: ["admins"],
    wide: true,
    superOnly: true,
    block: "team",
  },
  {
    id: "system",
    title: "Система",
    icon: Server,
    description: "Версия, часовой пояс и справочник Новой Почты. Только для просмотра.",
    groups: [],
    panels: ["system"],
    block: "team",
  },
];

const OTHER: SettingsSection = {
  id: OTHER_SECTION,
  title: "Прочее",
  icon: SlidersHorizontal,
  description: "Новые настройки, которым ещё не нашлось раздела.",
  groups: [],
  panels: [],
  block: "shop",
};

const SECTION_OF_GROUP: ReadonlyMap<string, string> = new Map(SECTIONS.flatMap((s) => s.groups.map((g) => [g, s.id] as const)));

/** Раздел, где показывается группа; неизвестная группа — «Прочее». Подарок редактируется на /gift, но ссылка — в «Кейс и подарки». */
export function sectionOfGroup(groupId: string): string {
  if (groupId === GIFT_GROUP) return "gift";
  return SECTION_OF_GROUP.get(groupId) ?? OTHER_SECTION;
}

export function isKnownSection(id: string): boolean {
  return id === OTHER_SECTION || SECTIONS.some((s) => s.id === id);
}

/**
 * Разделы, которые видит этот админ, с реальным составом групп. `groupIds` — группы, которые отдал сервер
 * (без доступа к финансам группы «ИИ» нет — нет и раздела). `superAdmin` undefined = ещё неизвестно (скрываем superOnly).
 */
export function visibleSections(groupIds: readonly string[], superAdmin: boolean | undefined): SettingsSection[] {
  const present = new Set(groupIds);
  const out: SettingsSection[] = [];
  for (const s of SECTIONS) {
    if (s.superOnly && !superAdmin) continue;
    const groups = s.groups.filter((g) => present.has(g));
    if (groups.length === 0 && s.panels.length === 0) continue;
    out.push({ ...s, groups });
  }
  const unmapped = groupIds.filter((g) => g !== GIFT_GROUP && !SECTION_OF_GROUP.has(g));
  if (unmapped.length > 0) {
    const shopEnd = out.filter((s) => s.block === "shop").length;
    out.splice(shopEnd, 0, { ...OTHER, groups: unmapped });
  }
  return out;
}

/** Вкладки «Доставки». Поле без известной вкладки попадает в «Прочее» (вкладка видна только тогда). */
export const NP_TABS = [
  { value: "checkout", label: "Чекаут и цена" },
  { value: "ttn", label: "ТТН и отправитель" },
  { value: "boxes", label: "Коробки и вес" },
  { value: "tracking", label: "Отслеживание" },
] as const;
export const NP_OTHER_TAB = "other";

/** Панели Новой Почты (`NP_PANELS` фичи delivery) — на своих вкладках. */
export const NP_PANEL_TAB: Readonly<Record<string, string>> = { sender: "ttn", sizes: "boxes", webhook: "tracking" };

export function npTabOf(subgroup: string | null | undefined): string {
  return NP_TABS.some((t) => t.value === subgroup) ? (subgroup as string) : NP_OTHER_TAB;
}

/** Вкладки «Оплаты»: бывший экран /payment и поля группы «Оплата и чеки». */
export const PAYMENT_TABS = [
  { value: "methods", label: "Способы оплаты" },
  { value: "params", label: "Параметры" },
] as const;
export const PAYMENT_PARAMS_TAB = "params";

/** Вкладка, на которой лежит поле (или null — у раздела нет вкладок). */
export function tabOfSetting(item: { group: string; subgroup?: string | null }): string | null {
  if (item.group === NP_GROUP) return npTabOf(item.subgroup);
  if (item.group === PAYMENT_GROUP) return PAYMENT_PARAMS_TAB;
  return null;
}

/** Куда ведёт ссылка на поле: страница раздела, нужная вкладка и якорь поля. Подарок — на /gift. */
export function settingHref(item: { key: string; group: string; subgroup?: string | null }): string {
  if (item.group === GIFT_GROUP) return "/gift";
  const tab = tabOfSetting(item);
  return `/settings/${sectionOfGroup(item.group)}${tab ? `?tab=${tab}` : ""}#setting-${item.key}`;
}

/** Старые якоря страницы /settings (`#group-<id>`, `#site`) → адрес раздела; null — не старый якорь. */
export function legacyAnchorTarget(hash: string): string | null {
  if (hash === "#site") return "/settings/site";
  if (!hash.startsWith("#group-")) return null;
  const group = hash.slice("#group-".length);
  if (group === GIFT_GROUP) return "/gift";
  // Поля «Оплаты и чеков» теперь на вкладке «Параметры», а не на первой («Способы оплаты»).
  if (group === PAYMENT_GROUP) return "/settings/payment?tab=params";
  return `/settings/${sectionOfGroup(group)}`;
}
