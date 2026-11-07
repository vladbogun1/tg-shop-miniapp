"use client";

/**
 * Настройки (route "/settings"): бизнес-параметры, которые раньше были константами в коде.
 *  - сгруппированный редактор, одно «Сохранить» на все правки (всё или ничего на сервере);
 *    «Сбросить» у поля = вернуть значение по умолчанию (сохранённое удаляется);
 *  - «Сайт»: пересобрать ISR; «Система»: факты только для чтения.
 * Секреты и инфраструктура (.env) API не отдаёт вообще.
 */
import { useForm } from "@shop/ui/form";
import { motion } from "framer-motion";
import { Bell, BellRing, Bot, Boxes, ChevronRight, Gift, LifeBuoy, ShieldAlert, SlidersHorizontal, Ticket, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { QueryState } from "@/components/ui/QueryState";
import { SitePanel } from "@/features/site";
import { ease } from "@/lib/motion";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import type { SettingItem, SettingValue } from "../api";
import { initialDraft, isDirty, parse, toRaw, validate, type Draft, type DraftEntry } from "../model/draft";
import { useSaveSettings, useSettingsQuery } from "../queries";
import { DevicePanel } from "./DevicePanel";
import { SaveBar } from "./SaveBar";
import { BotTexts, GroupFields } from "./SettingGroups";
import { SystemPanel } from "./SystemPanel";
import { matchesQuery, SettingsToolbar } from "./SettingsToolbar";

const EMPTY_DRAFT: Draft = {};

const GROUP_ICON: Record<string, LucideIcon> = {
  orders: Ticket,
  stock: Boxes,
  notifications: Bell,
  bot: Bot,
  novaposhta: Truck,
  inbox: BellRing,
  antibot: ShieldAlert,
  support: LifeBuoy,
};

export function SettingsScreen() {
  const q = useSettingsQuery();
  // «Приложение и уведомления»: на телефоне первым, на компьютере — сверху боковой колонки.
  const save = useSaveSettings();
  const [query, setQuery] = useState("");

  // Правки живут в форме (поле `entries`); заново заполняется, когда меняется копия сервера.
  const form = useForm<{ entries: Draft }>({ defaultValues: { entries: {} } });
  const draft = form.watch("entries") ?? EMPTY_DRAFT;
  const { reset: resetForm } = form;
  useEffect(() => {
    if (q.data) resetForm({ entries: initialDraft(q.data.items) });
  }, [q.data, resetForm]);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const dirtyItems = useMemo(() => items.filter((it) => isDirty(it, draft[it.key])), [items, draft]);
  const invalid = dirtyItems.some((it) => !draft[it.key].reset && validate(it, draft[it.key].raw));
  const dirty = dirtyItems.length > 0;
  // Поиск скрывает несовпавшие настройки; правки в скрытых полях остаются в форме и сохраняются.
  const shown = useMemo(() => items.filter((it) => matchesQuery([it.label, it.description, it.key], query)), [items, query]);
  const visibleGroups = (q.data?.groups ?? []).filter((g) => shown.some((it) => it.group === g.id));
  const showFirstDirty = () => document.getElementById("setting-" + dirtyItems[0]?.key)?.scrollIntoView({ block: "center", behavior: "smooth" });

  // Уход со страницы с несохранёнными правками их теряет — спросить (закрытие вкладки и ссылки меню).
  useUnsavedGuard(dirty);

  const setEntry = (key: string, entry: DraftEntry) => form.setValue("entries", { ...form.getValues("entries"), [key]: entry });
  const change = (key: string, raw: string | boolean) => setEntry(key, { raw, reset: false });
  const reset = (item: SettingItem) => setEntry(item.key, { raw: toRaw(item, item.defaultValue), reset: true });
  const discard = () => {
    if (q.data) resetForm({ entries: initialDraft(q.data.items) });
  };

  function submit() {
    if (!dirty || invalid) return;
    const values: Record<string, SettingValue | null> = {};
    for (const it of dirtyItems) {
      const e = draft[it.key];
      values[it.key] = e.reset ? null : parse(it, e.raw);
    }
    save.mutate(values);
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Настройки"
        subtitle="Параметры магазина, которые можно менять без деплоя. Токены, пароли и адреса сервисов здесь не показываются — они в .env на сервере."
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка настроек">
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            <SettingsToolbar query={query} onQuery={setQuery} groups={visibleGroups.filter((g) => g.id !== "gift")} />
            {query.trim() !== "" && visibleGroups.length === 0 && (
              <p className="panel p-5 text-[13px] text-[var(--text-muted)]">По запросу «{query.trim()}» настроек нет.</p>
            )}
            {visibleGroups.map((g, i) => {
              const groupItems = shown.filter((it) => it.group === g.id);
              if (groupItems.length === 0) return null;
              // Редактируется на своей странице (подарок — вместе с призами кейса).
              if (g.id === "gift") return <GiftLink key={g.id} title={g.title} />;
              return (
                <motion.section
                  key={g.id}
                  id={"group-" + g.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...ease, delay: i * 0.04 }}
                  className="panel min-w-0 scroll-mt-[88px] p-3 sm:p-5"
                >
                  <PanelHeader icon={GROUP_ICON[g.id] ?? SlidersHorizontal} title={g.title} description={g.description} />
                  {g.id === "bot" ? (
                    <BotTexts items={groupItems} draft={draft} onChange={change} onReset={reset} />
                  ) : (
                    <GroupFields items={groupItems} draft={draft} onChange={change} onReset={reset} />
                  )}
                </motion.section>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-[88px]">
            {/* On a phone this column stacks under the settings: the tall device card used to push them a screen down. */}
            <DevicePanel />
            <SitePanel />
            <SystemPanel />
          </div>
        </div>
      </QueryState>

      <SaveBar count={dirtyItems.length} invalid={invalid} saving={save.isPending} onDiscard={discard} onSave={submit} onShow={showFirstDirty} />
    </div>
  );
}

function GiftLink({ title }: { title: string }) {
  return (
    <Link href="/gift" className="panel focusable flex min-w-0 items-center gap-3 p-4 transition-colors hover:border-[var(--line-strong)]">
      <span className="accent-tint grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-md)]">
        <Gift className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="section-title block !text-[15px] text-[var(--ink)]">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-[var(--text-muted)]">Настраивается в разделе «Кейс»</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
    </Link>
  );
}
