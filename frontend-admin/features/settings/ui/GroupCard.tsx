"use client";

/** Одна группа настроек бэкенда карточкой: «ИИ» — своей панелью, «Бот» — с переключателем языка, остальные — списком полей. */
import { Bell, BellRing, Bot, Boxes, Calculator, Clock, LifeBuoy, Receipt, ShieldAlert, SlidersHorizontal, Star, Ticket, type LucideIcon } from "lucide-react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { AI_GROUP, AiSettingsPanel } from "@/features/ai";
import type { SettingsGroup, SettingItem } from "../api";
import { BotTexts, GroupFields } from "./SettingGroups";
import type { SettingsForm } from "./use-settings-form";

const GROUP_ICON: Record<string, LucideIcon> = {
  orders: Ticket,
  stock: Boxes,
  costing: Calculator,
  notifications: Bell,
  bot: Bot,
  inbox: BellRing,
  antibot: ShieldAlert,
  preorder: Clock,
  support: LifeBuoy,
  reviews: Star,
  payment: Receipt,
};

interface Props {
  group: SettingsGroup;
  items: SettingItem[];
  form: SettingsForm;
  focusKey: string | null;
}

export function GroupCard({ group, items, form, focusKey }: Props) {
  return (
    <section id={"group-" + group.id} className="panel min-w-0 scroll-mt-[88px] p-3 sm:p-5">
      <GroupBody group={group} items={items} form={form} focusKey={focusKey} />
    </section>
  );
}

function GroupBody({ group, items, form, focusKey }: Props) {
  if (group.id === AI_GROUP) {
    return (
      <AiSettingsPanel
        title={group.title}
        description={group.description}
        keys={items.map((it) => it.key)}
        labels={items.map((it) => it.label)}
        focusKey={focusKey}
        renderFields={(keys, views) => (
          <GroupFields
            items={keys.flatMap((k) => items.filter((it) => it.key === k))}
            draft={form.draft}
            views={views}
            onChange={form.changeAi}
            onReset={form.reset}
          />
        )}
      />
    );
  }
  return (
    <>
      <PanelHeader icon={GROUP_ICON[group.id] ?? SlidersHorizontal} title={group.title} description={group.description} />
      {group.id === "bot" ? (
        <BotTexts items={items} draft={form.draft} onChange={form.change} onReset={form.reset} focusKey={focusKey} />
      ) : (
        <GroupFields items={items} draft={form.draft} onChange={form.change} onReset={form.reset} />
      )}
    </>
  );
}
