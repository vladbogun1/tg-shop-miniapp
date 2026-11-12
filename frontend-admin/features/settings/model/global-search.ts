/**
 * Поиск по всем настройкам всех разделов (обзор /settings и Ctrl+K): поле находится по подписи, описанию или ключу,
 * панель — по заголовку и своим словам; результат ведёт на страницу раздела к самому полю.
 */
import type { SettingItem } from "../api";
import { matchesQuery } from "./search";
import { NP_PANEL_TAB, SECTIONS, sectionOfGroup, settingHref, OTHER_SECTION } from "./sections";

export interface SettingHit {
  key: string;
  label: string;
  /** «Доставка», «Заказы»… */
  section: string;
  href: string;
}

/** Панель, которую тоже находит поиск (отправитель НП, вебхуки…). */
export interface PanelSearchItem {
  id: string;
  title: string;
  keywords?: string;
}

function sectionTitle(id: string): string {
  if (id === OTHER_SECTION) return "Прочее";
  return SECTIONS.find((s) => s.id === id)?.title ?? id;
}

export function settingHits(items: readonly SettingItem[], query: string, fields: "all" | "label" = "all"): SettingHit[] {
  if (query.trim() === "") return [];
  return items
    .filter((it) => matchesQuery(fields === "label" ? [it.label] : [it.label, it.description, it.key], query))
    .map((it) => ({ key: it.key, label: it.label, section: sectionTitle(sectionOfGroup(it.group)), href: settingHref(it) }));
}

/** Панели Новой Почты: на вкладке «Доставки», где они живут. Находятся и по названию группы («пошта»). */
export function npPanelHits(panels: readonly PanelSearchItem[], query: string, groupTitle?: string): SettingHit[] {
  if (query.trim() === "") return [];
  return panels
    .filter((p) => matchesQuery([p.title, p.keywords, groupTitle], query))
    .map((p) => ({
      key: "np-" + p.id,
      label: p.title,
      section: sectionTitle("delivery"),
      href: `/settings/delivery?tab=${NP_PANEL_TAB[p.id] ?? "checkout"}#np-${p.id}`,
    }));
}
