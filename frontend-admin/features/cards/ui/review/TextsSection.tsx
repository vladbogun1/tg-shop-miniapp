"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { CardReviewData, TextField } from "../../model";
import { TEXT_FIELDS } from "../../model";
import { changedTextCount, LANG_LABEL, LANGS, textKey, type Lang } from "../../model/review-edit";
import { Section } from "./parts";
import { TextBlock } from "./TextBlock";

// Plain buttons, not SegmentedControl: its layout animation inside an exiting panel is
// what leaves framer's exit unfinished (see PanelLayer).
function LangTabs({ lang, onLang, changes }: { lang: Lang; onLang: (l: Lang) => void; changes: Record<string, unknown> }) {
  return (
    <div role="tablist" aria-label="Язык текстов" className="inline-flex items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px]">
      {LANGS.map((l) => {
        const count = changedTextCount(changes, l);
        return (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lang === l}
            onClick={() => onLang(l)}
            className={cn(
              "focusable hit font-display flex items-center gap-1.5 rounded-[var(--r-sm)] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors pointer-coarse:py-1.5",
              lang === l
                ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {LANG_LABEL[l]}
            {count > 0 && (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[10.5px] leading-[16px]",
                  lang === l ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TextsSection({
  data,
  currentText,
  texts,
  onText,
}: {
  data: CardReviewData | undefined;
  currentText: (lang: Lang, field: TextField) => string;
  texts: Record<string, string>;
  onText: (key: string, value: string) => void;
}) {
  const [lang, setLang] = useState<Lang>("ru");
  const changes = data?.last?.changed?.texts ?? {};
  const fields = TEXT_FIELDS.filter((f) => f !== "conditionNote" || !!currentText("ru", "conditionNote"));
  return (
    <Section title="Тексты" aside={<LangTabs lang={lang} onLang={setLang} changes={changes} />}>
      <div key={lang} className="tab-in flex flex-col gap-3">
        {fields.map((f) => {
          const key = textKey(lang, f);
          return (
            <TextBlock
              key={key}
              lang={lang}
              field={f}
              current={currentText(lang, f)}
              change={changes[key]}
              state={lang === "ru" ? undefined : data?.translations[lang]?.[f]}
              draft={texts[key]}
              onDraft={(v) => onText(key, v)}
            />
          );
        })}
        {lang !== "ru" && (
          <p className="text-[11.5px] text-[var(--text-faint)]">Правка перевода сохранится как ручная — следующий импорт ИИ её не перезапишет.</p>
        )}
      </div>
    </Section>
  );
}
