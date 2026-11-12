import { PALETTE_EXTRA, PRIMARY, SECTIONS, visibleTabs, type NavItem } from "./nav-config";

export interface PaletteEntry {
  /** Ключ строки; у разделов — их адрес. */
  key: string;
  href: string;
  label: string;
  /** Подпись строки (телефон, сумма, остаток…): только у найденных заказов, товаров и покупателей. */
  hint?: string;
  group: string;
  /** true — найдено поиском по данным (заказ, товар, покупатель), а не раздел меню. */
  found?: boolean;
  icon: NavItem["icon"];
}

/** Раздел меню как строка палитры. */
export type PaletteItem = PaletteEntry;

const entry = (href: string, label: string, group: string, icon: NavItem["icon"]): PaletteItem => ({ key: href, href, label, group, icon });

/**
 * Пункт меню как строки палитры: без вкладок — одна строка; с вкладками — строка на каждую видимую
 * вкладку, а название пункта уходит в группу («Категории» — «Каталог · Товары»), чтобы поиск «акции»
 * нашёл и «Промокоды», и «Кейс».
 */
function itemEntries(item: NavItem, section: string, superAdmin: boolean | undefined): PaletteItem[] {
  if (!item.tabs) return [entry(item.href, item.label, section, item.icon)];
  return visibleTabs(item, superAdmin).map((t) =>
    entry(t.href, t.label, t.label === item.label ? section : `${section} · ${item.label}`, t.icon ?? item.icon),
  );
}

/** Разделы для палитры из nav-config — с тем же фильтром superOnly, что и в меню, плюс страницы настроек. */
export function paletteItems(superAdmin: boolean | undefined): PaletteItem[] {
  const out: PaletteItem[] = PRIMARY.map((i) => entry(i.href, i.label, "Главное", i.icon));
  for (const sec of SECTIONS) {
    for (const i of sec.items) {
      if (i.superOnly && !superAdmin) continue;
      out.push(...itemEntries(i, sec.title, superAdmin));
    }
  }
  for (const i of PALETTE_EXTRA) {
    if (!i.superOnly || superAdmin) out.push(entry(i.href, i.label, "Настройки", i.icon));
  }
  return out;
}

/** Поиск по подстроке в названии или названии раздела; пустой запрос — всё. */
export function filterPalette(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
}
