"use client";

/**
 * «Доставка»: 30 полей Новой Почты на четырёх вкладках (вкладку поля задаёт бэкенд — `subgroup`) + панели
 * отправителя, размеров и вебхуков на своих вкладках. «Прочее» — только если есть поле без вкладки.
 * Все вкладки смонтированы (неактивные скрыты): правки в панелях не теряются при переключении.
 */
import { Truck } from "lucide-react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { Tabs } from "@/components/ui/Tabs";
import { NpSettingsPanels, type NpPanelId } from "@/features/delivery";
import type { SettingsGroup, SettingItem } from "../api";
import { NP_OTHER_TAB, NP_PANEL_TAB, NP_TABS, npTabOf } from "../model/sections";
import { GroupFields } from "./SettingGroups";
import type { SettingsForm } from "./use-settings-form";

const PANELS = Object.keys(NP_PANEL_TAB) as NpPanelId[];

export function deliveryTabs(items: readonly SettingItem[]) {
  const count = (tab: string) => items.filter((it) => npTabOf(it.subgroup) === tab).length;
  const tabs: { value: string; label: string; count?: number }[] = NP_TABS.map((t) => ({ value: t.value, label: t.label, count: count(t.value) }));
  const other = count(NP_OTHER_TAB);
  if (other > 0) tabs.push({ value: NP_OTHER_TAB, label: "Прочее", count: other });
  return tabs;
}

interface Props {
  group: SettingsGroup | undefined;
  items: SettingItem[];
  form: SettingsForm;
  tab: string;
  onTab: (tab: string) => void;
}

export function DeliverySection({ group, items, form, tab, onTab }: Props) {
  const tabs = deliveryTabs(items);
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0].value;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Tabs items={tabs} value={active} onChange={onTab} />
      {tabs.map((t) => (
        <section key={t.value} hidden={t.value !== active} id={"group-novaposhta-" + t.value} className="panel min-w-0 p-3 sm:p-5">
          <PanelHeader icon={Truck} title={t.label} description={t.value === tabs[0].value ? group?.description : undefined} />
          <GroupFields items={items.filter((it) => npTabOf(it.subgroup) === t.value)} draft={form.draft} onChange={form.change} onReset={form.reset} />
          <NpSettingsPanels shown={PANELS.filter((p) => NP_PANEL_TAB[p] === t.value)} />
        </section>
      ))}
    </div>
  );
}
