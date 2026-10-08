"use client";

/**
 * Title / description / condition note of one reviewed product in RU · UA · EN: the AI answer
 * gives the whole card in three languages, so no separate trip to «Переводы». Russian shows the
 * word diff against the current text with «accept» checkboxes; every language is editable inline
 * (the checks of «Переводы» re-run on each keystroke).
 */
import { Languages, PencilLine } from "lucide-react";
import { useMemo, useState } from "react";
import { TEXT_LABEL, wordDiff, type CardIssue, type ProductReview, type TextField, type TextLang, type TextReview } from "@/lib/card-check";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Diff, InlineText, SourceText } from "@/components/translations/shared";
import { ruAccepted, translationSendable, type ProductSel } from "@/components/cards/selection";
import { CardIssues, Check } from "@/components/cards/shared";

const LANG_LABEL: Record<TextLang, string> = { ru: "RU", uk: "UA", en: "EN" };

function problemCount(issues: CardIssue[]): number {
  return issues.filter((i) => i.level !== "info").length;
}

export function TextsBlock({
  review: r,
  sel,
  onSel,
  onEditText,
}: {
  review: ProductReview;
  sel: ProductSel;
  onSel: (patch: Partial<ProductSel>) => void;
  onEditText: (field: TextField, lang: TextLang, value: string) => void;
}) {
  const [lang, setLang] = useState<TextLang>("ru");
  const texts = (["title", "description", "conditionNote"] as const).map((f) => r.texts[f]).filter((t): t is TextReview => !!t);
  const count = (l: TextLang) => texts.reduce((n, t) => n + problemCount(t.issues[l]), 0) || undefined;
  const hasTranslations = texts.some((t) => t.uk.trim() || t.en.trim());

  return (
    <div className="mt-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Languages className="h-4 w-4 text-[var(--text-faint)]" />
        <span className="field-label !text-[11px]">Тексты</span>
        <SegmentedControl<TextLang>
          size="sm"
          value={lang}
          onChange={setLang}
          options={(["ru", "uk", "en"] as const).map((l) => ({ value: l, label: LANG_LABEL[l], count: count(l) }))}
        />
        {hasTranslations && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[var(--text-muted)]">
            <Check checked={sel.translations} onChange={(v) => onSel({ translations: v })} label="Сохранить переводы UA/EN" />
            Сохранить переводы UA/EN
          </label>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {texts.map((t) =>
          lang === "ru" ? (
            <RuText key={t.field} t={t} sel={sel} onSel={onSel} onEdit={(v) => onEditText(t.field, "ru", v)} />
          ) : (
            <LangText key={t.field} t={t} lang={lang} sel={sel} onEdit={(v) => onEditText(t.field, lang, v)} />
          )
        )}
      </div>
    </div>
  );
}

function RuText({ t, sel, onSel, onEdit }: { t: TextReview; sel: ProductSel; onSel: (p: Partial<ProductSel>) => void; onEdit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const diff = useMemo(() => {
    if (!t.changed) return null;
    const parts = wordDiff(t.from, t.ru);
    if (!parts) return null;
    // A full rewrite as a word diff is red-green noise: show «было» / «станет» instead.
    const same = parts.filter((p) => p.type === "same").reduce((n, p) => n + p.text.trim().length, 0);
    return same / Math.max(1, t.ru.length) < 0.4 && t.field === "description" ? null : parts;
  }, [t.changed, t.from, t.ru, t.field]);
  const ruError = t.issues.ru.some((i) => i.level === "error");
  const key = t.field === "title" ? "title" : "description";
  const checkable = t.field !== "conditionNote" && t.changed;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {checkable && (
          <Check
            checked={sel[key]}
            disabled={ruError}
            onChange={(v) => onSel({ [key]: v })}
            label={t.field === "title" ? "Принять новое название" : "Заменить описание"}
          />
        )}
        <span className="text-[12.5px] font-semibold text-[var(--text)]">{TEXT_LABEL[t.field]}</span>
        {t.field === "conditionNote" ? (
          <Badge tone="neutral">не меняется</Badge>
        ) : t.changed ? (
          <span className="text-[11.5px] text-[var(--text-faint)]">{t.field === "title" ? "переименовать" : `заменить · ${t.from.length} → ${t.ru.length} симв.`}</span>
        ) : (
          <Badge tone="neutral">без изменений</Badge>
        )}
        {t.field !== "conditionNote" && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="ml-auto inline-flex items-center gap-1 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-faint)] hover:text-[var(--accent-hi)]"
          >
            <PencilLine className="h-3.5 w-3.5" /> {editing ? "Готово" : "Править"}
          </button>
        )}
      </div>
      {editing ? (
        <InlineText ariaLabel={`${TEXT_LABEL[t.field]} RU`} value={t.ru} invalid={ruError} onChange={onEdit} />
      ) : diff ? (
        <Diff parts={diff} />
      ) : t.changed && t.from ? (
        <div className="grid gap-2 lg:grid-cols-2">
          <div>
            <div className="field-label mb-1 !text-[10.5px] !text-[var(--text-faint)]">Было</div>
            <div className="text-[var(--text-muted)] opacity-80">
              <SourceText text={t.from} />
            </div>
          </div>
          <div>
            <div className="field-label mb-1 !text-[10.5px] !text-[var(--text-faint)]">Станет</div>
            <SourceText text={t.ru} clamp={false} />
          </div>
        </div>
      ) : (
        <SourceText text={t.ru} />
      )}
      <div className="mt-1">
        <CardIssues issues={t.issues.ru} />
      </div>
    </div>
  );
}

function LangText({ t, lang, sel, onEdit }: { t: TextReview; lang: "uk" | "en"; sel: ProductSel; onEdit: (v: string) => void }) {
  const sendable = translationSendable(t, lang, sel);
  const why = !sel.translations
    ? "переводы выключены"
    : !ruAccepted(t, sel)
      ? t.field === "title"
        ? "новое название не принято — перевод сделан для него"
        : "новое описание не принято — перевод сделан для него"
      : !t[lang].trim()
        ? "нет перевода"
        : "ошибка в переводе";
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-semibold text-[var(--text)]">{TEXT_LABEL[t.field]}</span>
        {sendable ? <Badge tone="ok">сохранится</Badge> : <Badge tone="neutral">не сохранится — {why}</Badge>}
      </div>
      <div className={cn(!sendable && "opacity-70")}>
        <InlineText
          ariaLabel={`${TEXT_LABEL[t.field]} ${lang === "uk" ? "UA" : "EN"}`}
          value={t[lang]}
          invalid={t.issues[lang].some((i) => i.level === "error")}
          onChange={onEdit}
        />
      </div>
      <div className="mt-1">
        <CardIssues issues={t.issues[lang]} />
      </div>
    </div>
  );
}
