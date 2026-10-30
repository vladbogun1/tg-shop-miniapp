"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { SettingItem } from "../api";
import { isDirty, type Draft } from "../model/draft";
import { SettingField } from "./SettingField";

export interface GroupProps {
  items: SettingItem[];
  draft: Draft;
  onChange: (key: string, raw: string | boolean) => void;
  onReset: (item: SettingItem) => void;
}

export function GroupFields({ items, draft, onChange, onReset }: GroupProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {items.map((it) =>
        draft[it.key] ? (
          <SettingField key={it.key} item={it} entry={draft[it.key]} onChange={(raw) => onChange(it.key, raw)} onReset={() => onReset(it)} />
        ) : null,
      )}
    </div>
  );
}

const BOT_TEXT_PREFIX = "bot.startText.";
type BotLang = "uk" | "ru" | "en";
const BOT_LANGS: { value: BotLang; label: string }[] = [
  { value: "uk", label: "Укр" },
  { value: "ru", label: "Рус" },
  { value: "en", label: "Eng" },
];

/** Три приветствия /start — один редактор с переключателем языка. */
export function BotTexts({ items, draft, onChange, onReset }: GroupProps) {
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
      <GroupFields items={others} draft={draft} onChange={onChange} onReset={onReset} />
    </div>
  );
}
