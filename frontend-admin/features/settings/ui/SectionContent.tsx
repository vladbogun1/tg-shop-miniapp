"use client";

/** Содержимое страницы раздела: группы настроек и панели раздела (данные — `model/sections.ts`). */
import { ChevronRight, Gift } from "lucide-react";
import Link from "next/link";
import { Tabs } from "@/components/ui/Tabs";
import { PaymentSettingsScreen } from "@/features/payment";
import { SitePanel } from "@/features/site";
import { AdminsScreen } from "@/features/staff";
import type { SettingsGroup, SettingItem } from "../api";
import { NP_GROUP, PAYMENT_GROUP, PAYMENT_TABS, type SectionPanel, type SettingsSection } from "../model/sections";
import { DeliverySection } from "./DeliverySection";
import { GroupCard } from "./GroupCard";
import { SystemPanel } from "./SystemPanel";
import type { SettingsForm } from "./use-settings-form";

export interface SectionContentProps {
  section: SettingsSection;
  groups: SettingsGroup[];
  items: SettingItem[];
  form: SettingsForm;
  tab: string | null;
  onTab: (tab: string) => void;
  focusKey: string | null;
  onPaymentDirty: (dirty: boolean) => void;
}

export function SectionContent(props: SectionContentProps) {
  const { section } = props;
  if (section.id === "payment") return <PaymentContent {...props} />;
  if (section.id === "delivery") {
    return (
      <DeliverySection
        group={props.groups.find((g) => g.id === NP_GROUP)}
        items={props.items.filter((it) => it.group === NP_GROUP)}
        form={props.form}
        tab={props.tab ?? ""}
        onTab={props.onTab}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Groups {...props} />
      {section.panels.map((p) => (
        <Panel key={p} panel={p} />
      ))}
    </div>
  );
}

function Groups({ groups, items, form, focusKey }: SectionContentProps) {
  return (
    <>
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} items={items.filter((it) => it.group === g.id)} form={form} focusKey={focusKey} />
      ))}
    </>
  );
}

/** «Оплата»: бывший экран /payment (своё сохранение) и поля группы «Оплата и чеки» (общий «Сохранить»). Обе вкладки смонтированы. */
function PaymentContent(props: SectionContentProps) {
  const tab = PAYMENT_TABS.some((t) => t.value === props.tab) ? (props.tab as string) : PAYMENT_TABS[0].value;
  const hasParams = props.groups.some((g) => g.id === PAYMENT_GROUP);
  const tabs = hasParams ? [...PAYMENT_TABS] : [PAYMENT_TABS[0]];
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {tabs.length > 1 && <Tabs items={tabs} value={tab} onChange={props.onTab} />}
      <div hidden={tab !== "methods"} className="min-w-0">
        <PaymentSettingsScreen onDirtyChange={props.onPaymentDirty} />
      </div>
      {hasParams && (
        <div hidden={tab !== "params"} className="flex min-w-0 flex-col gap-6">
          <Groups {...props} />
        </div>
      )}
    </div>
  );
}

function Panel({ panel }: { panel: SectionPanel }) {
  switch (panel) {
    case "gift-link":
      return <GiftLink />;
    case "site":
      return <SitePanel />;
    case "system":
      return <SystemPanel />;
    case "admins":
      return <AdminsScreen embedded />;
    default:
      return null;
  }
}

function GiftLink() {
  return (
    <Link href="/gift" className="panel focusable flex min-w-0 items-center gap-3 p-4 transition-colors hover:border-[var(--line-strong)]">
      <span className="accent-tint grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)]">
        <Gift className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="section-title block !text-[15px] text-[var(--ink)]">Подарок за сумму (кейсы)</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[var(--text-muted)]">Настраивается в разделе «Кейс» вместе с призами</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
    </Link>
  );
}
