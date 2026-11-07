"use client";

import { Bot } from "lucide-react";
import type { ReactNode } from "react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { blockKeys, unlistedKeys, type AiBlock } from "../model/setting-keys";
import { AiSearchBlock } from "./AiSearchBlock";
import { AiStateBlock } from "./AiStateBlock";

interface Props {
  title: string;
  description?: string;
  /** Ключи настроек группы «ИИ», которые сервер отдал этому админу. */
  keys: readonly string[];
  /**
   * Поля настроек по ключам рисует экран «Настроек»: правки идут в его форму и сохраняются его кнопкой «Сохранить»,
   * поэтому панель сама ничего не читает и не пишет (и не импортирует фичу «Настройки» — она импортирует эту).
   */
  renderFields: (keys: readonly string[]) => ReactNode;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3 border-t border-[var(--line)] pt-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="field-label">{title}</h3>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-[var(--text-muted)]">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * «ИИ» в настройках, только для финансового доступа (группа приходит из /settings лишь им): состояние и расход,
 * функции, лимиты, поиск, уведомления. Тексты по-русски, деньги — доллары и гривны.
 */
export function AiSettingsPanel({ title, description, keys, renderFields }: Props) {
  const present = new Set(keys);
  const of = (block: AiBlock) => blockKeys(block).filter((k) => present.has(k));
  const rest = unlistedKeys(keys);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PanelHeader icon={Bot} title={title} description={description} />
      <Section title="Состояние">
        <AiStateBlock />
      </Section>
      <Section title="Функции" hint="Каждая выключена, пока вы её не включите. Общий выключатель останавливает всё.">
        {renderFields(of("functions"))}
      </Section>
      <Section title="Лимиты" hint="Лимит включает и модель, и платный поиск. Достигнутый лимит останавливает новые задачи.">
        {renderFields([...of("limits"), ...rest])}
      </Section>
      <Section title="Поиск">
        <AiSearchBlock fields={renderFields(of("search"))} />
      </Section>
      <Section title="Уведомления" hint="Push приходит при 80% и при достижении лимита, при отказе ключа и сбое поиска.">
        {renderFields(of("alerts"))}
      </Section>
    </div>
  );
}
