"use client";

import { Bot, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { AI_KEYS, blockKeys, unlistedKeys, type AiBlock } from "../model/setting-keys";
import { aiSettingViews, type SettingView } from "../model/setting-views";
import { useAiState } from "../queries";
import { AiSearchBlock } from "./AiSearchBlock";
import { AiSettingsHistory } from "./AiSettingsHistory";
import { AiStateBlock } from "./AiStateBlock";

interface Props {
  title: string;
  description?: string;
  /** Ключи настроек группы «ИИ», которые сервер отдал этому админу. */
  keys: readonly string[];
  /** Подписи этих полей: по ним «История изменений» отбирает правки «ИИ» из журнала настроек. */
  labels: readonly string[];
  /**
   * Поля настроек по ключам рисует экран «Настроек»: правки идут в его форму (выключатели и списки он сохраняет
   * сразу, числа — его кнопкой «Сохранить»), поэтому панель сама ничего не пишет и не импортирует фичу «Настройки».
   * `views` — числа, которые показываются не в единицах хранения (лимиты — доллары вместо центов).
   */
  renderFields: (keys: readonly string[], views?: Readonly<Record<string, SettingView>>) => ReactNode;
  /** Поле, на которое ведёт ссылка: если оно в «Дополнительно», раскрывашка открывается сама. */
  focusKey?: string | null;
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

/** Раскрывашка «Ещё»: содержимое монтируется только раскрытым (история грузится по требованию). */
function Disclosure({ title, hint, forceOpen = false, children }: { title: string; hint: string; forceOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <div className="min-w-0 rounded-[var(--r-md)] border border-[var(--line)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="focusable flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-hover)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[var(--text)]">{title}</span>
          <span className="block text-[12px] leading-snug text-[var(--text-muted)]">{hint}</span>
        </span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <div className="min-w-0 border-t border-[var(--line)] p-3">{children}</div>}
    </div>
  );
}

/**
 * «ИИ» в настройках, только для финансового доступа (группа приходит из /settings лишь им), по макету 07-settings:
 * Состояние (общий выключатель и расход), Лимиты в долларах с гривнами, Функции, Поиск, Уведомления и «Ещё» —
 * «Дополнительно» (потолок, дедлайн, темп поиска, хранение, курс) и «История изменений».
 */
export function AiSettingsPanel({ title, description, keys, labels, renderFields, focusKey }: Props) {
  const present = new Set(keys);
  const of = (block: AiBlock) => blockKeys(block).filter((k) => present.has(k));
  const rateMilli = useAiState().data?.rateMilli;
  const views = useMemo(() => aiSettingViews(rateMilli), [rateMilli]);
  const moreKeys = [...of("more"), ...unlistedKeys(keys)];
  const moneyLabels = keys.flatMap((k, i) => (k === AI_KEYS.monthLimit || k === AI_KEYS.dayLimit ? [labels[i] ?? k] : []));
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PanelHeader icon={Bot} title={title} description={description} />
      <Section title="Состояние">
        {renderFields(of("state"))}
        <AiStateBlock />
      </Section>
      <Section title="Лимиты" hint="В долларах, гривны — по курсу рядом. Лимит включает модель и платный поиск; достигнутый останавливает новые задачи.">
        {renderFields(of("limits"), views)}
      </Section>
      <Section title="Функции" hint="Каждая выключена, пока вы её не включите. Выключатели сохраняются сразу.">
        {renderFields(of("functions"))}
      </Section>
      <Section title="Поиск">
        <AiSearchBlock fields={renderFields(of("search"))} />
      </Section>
      <Section title="Уведомления" hint="Push приходит при 80% и при достижении лимита, при отказе ключа и сбое поиска.">
        {renderFields(of("alerts"))}
      </Section>
      <Section title="Ещё">
        <Disclosure
          title="Дополнительно"
          hint="Потолок на задачу, дедлайн, темп поиска, хранение, курс доллара"
          forceOpen={!!focusKey && moreKeys.includes(focusKey)}
        >
          {renderFields(moreKeys)}
        </Disclosure>
        <Disclosure title="История изменений" hint="Кто и когда менял лимиты и выключатели">
          <AiSettingsHistory labels={labels} moneyLabels={moneyLabels} rateKopecks={rateMilli ? Math.round(rateMilli / 10) : null} />
        </Disclosure>
      </Section>
    </div>
  );
}
