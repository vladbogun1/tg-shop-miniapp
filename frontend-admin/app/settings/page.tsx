"use client";

/**
 * Settings (route "/settings"): business parameters that used to be constants in code.
 *  - GET/PUT /api/admin/settings — grouped editor, one "Сохранить" for all changes (all-or-nothing
 *    on the server), "Сбросить" per field = back to the default (stored value removed).
 *  - «Сайт»: force an ISR rebuild; «Система»: read-only facts.
 * Secrets and infrastructure (.env) are deliberately not exposed by the API at all.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  BellRing,
  Bot,
  Boxes,
  Save,
  SlidersHorizontal,
  Ticket,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ApiError } from "@/lib/api";
import { ease } from "@/lib/motion";
import {
  SETTINGS_QUERY_KEY,
  settingsApi,
  type SettingItem,
  type SettingValue,
} from "@/lib/settings";
import { useToast } from "@/lib/toast";
import { initialDraft, isDirty, parse, toRaw, validate, type Draft } from "./draft";
import { PanelHeader } from "./PanelHeader";
import { SettingField } from "./SettingField";
import { SitePanel } from "./SitePanel";
import { SystemPanel } from "./SystemPanel";

const GROUP_ICON: Record<string, LucideIcon> = {
  orders: Ticket,
  stock: Boxes,
  notifications: Bell,
  bot: Bot,
  novaposhta: Truck,
  inbox: BellRing,
};

const BOT_TEXT_PREFIX = "bot.startText.";
type BotLang = "uk" | "ru" | "en";
const BOT_LANGS: { value: BotLang; label: string }[] = [
  { value: "uk", label: "Укр" },
  { value: "ru", label: "Рус" },
  { value: "en", label: "Eng" },
];

export default function SettingsPage() {
  const { push } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SETTINGS_QUERY_KEY, queryFn: settingsApi.list });

  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  // (Re)initialise the form whenever the server copy changes (first load, after save).
  useEffect(() => {
    if (q.data) setDraft(initialDraft(q.data.items));
  }, [q.data]);

  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const dirtyItems = useMemo(() => items.filter((it) => isDirty(it, draft[it.key])), [items, draft]);
  const invalid = dirtyItems.some((it) => !draft[it.key].reset && validate(it, draft[it.key].raw));
  const dirty = dirtyItems.length > 0;

  // Leaving the page with unsaved edits loses them — ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(key: string, raw: string | boolean) {
    setDraft((d) => ({ ...d, [key]: { raw, reset: false } }));
  }

  function reset(item: SettingItem) {
    setDraft((d) => ({ ...d, [item.key]: { raw: toRaw(item, item.defaultValue), reset: true } }));
  }

  function discard() {
    if (q.data) setDraft(initialDraft(q.data.items));
  }

  async function save() {
    if (!dirty || invalid) return;
    const values: Record<string, SettingValue | null> = {};
    for (const it of dirtyItems) {
      const e = draft[it.key];
      values[it.key] = e.reset ? null : parse(it, e.raw);
    }
    setSaving(true);
    try {
      const fresh = await settingsApi.save(values);
      qc.setQueryData(SETTINGS_QUERY_KEY, fresh);
      // Thresholds of «Внимание» may have changed.
      qc.invalidateQueries({ queryKey: ["admin", "inbox"] });
      qc.invalidateQueries({ queryKey: ["settings-system"] });
      push(dirtyItems.length === 1 ? "Настройка сохранена" : `Сохранено настроек: ${dirtyItems.length}`, "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 pb-28">
      <PageHeader
        title="Настройки"
        subtitle="Параметры магазина, которые можно менять без деплоя. Токены, пароли и адреса сервисов здесь не показываются — они в .env на сервере."
      />

      <QueryState
        isLoading={q.isLoading}
        isError={q.isError}
        error={q.error}
        refetch={q.refetch}
        loadingLabel="Загрузка настроек"
      >
        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-6">
            {(q.data?.groups ?? []).map((g, i) => {
              const groupItems = items.filter((it) => it.group === g.id);
              if (groupItems.length === 0) return null;
              return (
                <motion.section
                  key={g.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...ease, delay: i * 0.04 }}
                  className="panel min-w-0 p-5"
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
            <SitePanel />
            <SystemPanel />
          </div>
        </div>
      </QueryState>

      {/* Save bar — only while there is something to save */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] lg:left-[260px] lg:px-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 text-[13px] font-bold text-[var(--text)]">
                Несохранённых изменений: {dirtyItems.length}
                {invalid && (
                  <span className="block text-[12px] font-semibold text-[var(--danger)]">
                    Исправьте поля с ошибками
                  </span>
                )}
              </div>
              <div className="flex flex-1 justify-end gap-2 sm:flex-none">
                <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={discard} disabled={saving}>
                  Отменить
                </Button>
                <Button
                  variant="accent"
                  icon={<Save className="h-4 w-4" />}
                  loading={saving}
                  disabled={invalid}
                  onClick={save}
                >
                  Сохранить
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GroupFields({
  items,
  draft,
  onChange,
  onReset,
}: {
  items: SettingItem[];
  draft: Draft;
  onChange: (key: string, raw: string | boolean) => void;
  onReset: (item: SettingItem) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {items.map((it) =>
        draft[it.key] ? (
          <SettingField
            key={it.key}
            item={it}
            entry={draft[it.key]}
            onChange={(raw) => onChange(it.key, raw)}
            onReset={() => onReset(it)}
          />
        ) : null
      )}
    </div>
  );
}

/** The three /start greetings share one editor with a language switch. */
function BotTexts({
  items,
  draft,
  onChange,
  onReset,
}: {
  items: SettingItem[];
  draft: Draft;
  onChange: (key: string, raw: string | boolean) => void;
  onReset: (item: SettingItem) => void;
}) {
  const [lang, setLang] = useState<BotLang>("uk");
  const item = items.find((it) => it.key === BOT_TEXT_PREFIX + lang);
  const others = items.filter((it) => !it.key.startsWith(BOT_TEXT_PREFIX));
  const options = BOT_LANGS.map((l) => {
    const it = items.find((x) => x.key === BOT_TEXT_PREFIX + l.value);
    const changed = it ? isDirty(it, draft[it.key]) : false;
    return { value: l.value, label: changed ? `${l.label} •` : l.label };
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SegmentedControl options={options} value={lang} onChange={setLang} className="self-start" />
      {item && draft[item.key] && (
        <SettingField
          key={item.key}
          item={item}
          entry={draft[item.key]}
          labelOverride="Приветствие на /start"
          onChange={(raw) => onChange(item.key, raw)}
          onReset={() => onReset(item)}
        />
      )}
      {others.map((it) =>
        draft[it.key] ? (
          <SettingField
            key={it.key}
            item={it}
            entry={draft[it.key]}
            onChange={(raw) => onChange(it.key, raw)}
            onReset={() => onReset(it)}
          />
        ) : null
      )}
    </div>
  );
}
