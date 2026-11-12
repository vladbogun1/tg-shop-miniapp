"use client";

import { useEffect, useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { SettingView } from "@/features/ai";
import type { SettingItem } from "../api";
import { isDirty, type Draft } from "../model/draft";
import { SettingField } from "./SettingField";
import { LOCALES, type Locale } from "@shop/core/i18n";

export interface GroupProps {
  items: SettingItem[];
  draft: Draft;
  onChange: (key: string, raw: string | boolean) => void;
  onReset: (item: SettingItem) => void;
  /** Числа, которые показываются не в единицах хранения (лимиты ИИ — доллары вместо центов). */
  views?: Readonly<Record<string, SettingView>>;
}

export function GroupFields({ items, draft, onChange, onReset, views }: GroupProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {items.map((it) =>
        draft[it.key] ? (
          <SettingField
            key={it.key}
            item={it}
            entry={draft[it.key]}
            view={views?.[it.key]}
            onChange={(raw) => onChange(it.key, raw)}
            onReset={() => onReset(it)}
          />
        ) : null,
      )}
    </div>
  );
}

const BOT_TEXT_PREFIX = "bot.startText.";
type BotLang = Locale;
const BOT_LANG_LABEL: Record<BotLang, string> = { uk: "Укр", ru: "Рус", en: "Eng" };
const BOT_LANGS: { value: BotLang; label: string }[] = LOCALES.map((l) => ({ value: l, label: BOT_LANG_LABEL[l] }));

/** Три приветствия /start — один редактор с переключателем языка. */
export function BotTexts({ items, draft, onChange, onReset, focusKey }: GroupProps & { focusKey?: string | null }) {
  const [lang, setLang] = useState<BotLang>("uk");
  // Ссылка на приветствие другого языка (поиск, Ctrl+K) переключает язык, иначе поля нет на странице.
  useEffect(() => {
    const l = focusKey?.startsWith(BOT_TEXT_PREFIX) ? focusKey.slice(BOT_TEXT_PREFIX.length) : null;
    const found = BOT_LANGS.find((x) => x.value === l);
    if (found) setLang(found.value);
  }, [focusKey]);
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
      {item && draft[item.key] && <BotBubble text={String(draft[item.key].raw)} />}
      {others.length > 0 && <GroupFields items={others} draft={draft} onChange={onChange} onReset={onReset} />}
    </div>
  );
}

/**
 * Как приветствие увидит покупатель: пузырь с текстом (обычный текст, без разметки) и кнопка под ним.
 * Пусто — бот пришлёт текст по умолчанию, поэтому пузырь не рисуем. Кнопка — как в боте, здесь не редактируется.
 */
function BotBubble({ text }: { text: string }) {
  const empty = text.trim() === "";
  if (empty) return <p className="text-[12px] text-[var(--text-faint)]">Поле пустое — бот использует текст по умолчанию.</p>;
  return (
    <div className="min-w-0 max-w-[420px]" aria-label="Предпросмотр приветствия">
      <div className="whitespace-pre-wrap break-words rounded-[var(--r-md)] rounded-bl-[4px] bg-[var(--surface-3)] px-3 py-2 text-[13px] leading-snug text-[var(--text)]">
        {text}
      </div>
      <div className="mt-1 rounded-[var(--r-sm)] border border-[var(--line)] px-3 py-1.5 text-center text-[12px] text-[var(--text-muted)]">
        Кнопка магазина — как в боте, не редактируется
      </div>
    </div>
  );
}
