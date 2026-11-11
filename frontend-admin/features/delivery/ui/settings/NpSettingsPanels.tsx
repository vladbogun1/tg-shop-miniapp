"use client";

/**
 * Панели Новой Почты в группе «Новая Почта» настроек: отправитель, вебхуки, размеры по категориям.
 * Поиск настроек находит их по заголовку — экран настроек сам решает, какие показать (`shown`).
 */
import { NpCategorySizesPanel } from "./NpCategorySizesPanel";
import { NpSenderPanel } from "./NpSenderPanel";
import { NpWebhookPanel } from "./NpWebhookPanel";

export const NP_PANELS = [
  { id: "sender", title: "Отправитель Новой Почты", keywords: "кабинет ключ отделение отправки коробки" },
  { id: "webhook", title: "Миттєві статуси (вебхуки)", keywords: "мгновенные статусы подписка" },
  { id: "sizes", title: "Размеры по категориям", keywords: "вес коробка посылка габариты" },
] as const;

export type NpPanelId = (typeof NP_PANELS)[number]["id"];

const PANEL = { sender: NpSenderPanel, webhook: NpWebhookPanel, sizes: NpCategorySizesPanel };

export function NpSettingsPanels({ shown }: { shown: readonly NpPanelId[] }) {
  return (
    <>
      {NP_PANELS.filter((p) => shown.includes(p.id)).map((p) => {
        const Panel = PANEL[p.id];
        return (
          <div key={p.id} id={"np-" + p.id} className="min-w-0 scroll-mt-[88px] border-t border-[var(--line)] pt-5">
            <Panel title={p.title} />
          </div>
        );
      })}
    </>
  );
}
