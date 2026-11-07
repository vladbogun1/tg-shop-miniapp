import { PRIMARY, SECTIONS, type NavItem } from "./nav-config";

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

/** Разделы для палитры из nav-config — с тем же фильтром superOnly, что и в меню. */
export function paletteItems(superAdmin: boolean | undefined): PaletteItem[] {
  const out: PaletteItem[] = PRIMARY.map((i) => ({ key: i.href, href: i.href, label: i.label, group: "Главное", icon: i.icon }));
  for (const sec of SECTIONS) {
    for (const i of sec.items) {
      if (i.superOnly && !superAdmin) continue;
      out.push({ key: i.href, href: i.href, label: i.label, group: sec.title, icon: i.icon });
    }
  }
  return out;
}

/** Поиск по подстроке в названии или названии раздела; пустой запрос — всё. */
export function filterPalette(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q));
}
