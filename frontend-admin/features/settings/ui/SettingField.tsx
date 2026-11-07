"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { SettingView } from "@/features/ai";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { formatIsoOrNull } from "@/lib/format-iso";
import type { SettingItem } from "../api";
import { formatValue, isDefault, isDirty, validate, type DraftEntry } from "../model/draft";

function SettingControl({
  item,
  entry,
  error,
  view,
  onChange,
}: {
  item: SettingItem;
  entry: DraftEntry;
  error: string | null;
  view?: SettingView;
  onChange: (raw: string | boolean) => void;
}) {
  switch (item.type) {
    case "BOOL":
      return <Toggle checked={Boolean(entry.raw)} onChange={onChange} label={entry.raw ? "Включено" : "Выключено"} />;
    case "INT":
      return view ? (
        <ViewControl item={item} entry={entry} view={view} onChange={onChange} />
      ) : (
        <IntControl item={item} entry={entry} error={error} onChange={onChange} />
      );
    case "SELECT":
      return (
        <div className="w-full">
          <Select<string> label={item.label} value={String(entry.raw)} onChange={(v) => onChange(v)} options={item.options ?? []} />
        </div>
      );
    case "TEXT":
      return <TextControl item={item} entry={entry} error={error} onChange={onChange} />;
    default:
      return (
        <div className="w-full">
          <Input aria-label={item.label} value={String(entry.raw)} onChange={(e) => onChange(e.target.value)} error={error ?? undefined} />
        </div>
      );
  }
}

type ControlProps = Parameters<typeof SettingControl>[0];

function IntControl({ item, entry, error, onChange }: ControlProps) {
  return (
    <div className="w-full">
      <Input
        aria-label={item.label}
        inputMode="numeric"
        value={String(entry.raw)}
        onChange={(e) => onChange(e.target.value)}
        error={error ?? undefined}
        rightSlot={
          item.unit ? (
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{item.unit}</span>
          ) : undefined
        }
      />
    </div>
  );
}

/**
 * Число в единицах показа (`view`): своё текстовое состояние, чтобы «2,» не превращалось в «2» на ходу; правка
 * уходит в форму в единицах сервера. Сброс или новая копия сервера заменяют текст.
 */
function ViewControl({ item, entry, view, onChange }: { item: SettingItem; entry: DraftEntry; view: SettingView; onChange: (raw: string) => void }) {
  const raw = String(entry.raw);
  const [text, setText] = useState(() => view.toView(raw));
  useEffect(() => {
    setText((t) => (view.fromView(t) === raw ? t : view.toView(raw)));
  }, [raw, view]);
  const error = view.check(text);
  return (
    <div className="w-full">
      <Input
        aria-label={item.label}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(view.fromView(e.target.value));
        }}
        error={error ?? undefined}
        hint={error ? undefined : (view.note(raw) ?? undefined)}
        rightSlot={<span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{view.unit}</span>}
      />
    </div>
  );
}

function TextControl({ item, entry, error, onChange }: ControlProps) {
  return (
    <div className="w-full">
      <Textarea
        aria-label={item.label}
        rows={5}
        value={String(entry.raw)}
        placeholder="Пусто — стандартный текст"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className={cn("mt-1 flex justify-between gap-2 text-[12px]", error ? "text-[var(--danger-ink)]" : "text-[var(--text-faint)]")}>
        <span>{error}</span>
        {item.maxLength != null && (
          <span>
            {String(entry.raw).trim().length} / {item.maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

/** Длинные значения (текст, строка) занимают всю ширину строки; числа, переключатели и списки — колонку справа. */
export function isWide(item: SettingItem): boolean {
  return item.type === "TEXT" || item.type === "STRING";
}

/**
 * Одна настройка — плотная строка: подпись и описание слева, контроль справа (на телефоне — под подписью),
 * «По умолчанию: …» с «Сбросить» и «изменено <дата>, <кто>». Две метки: «Не сохранено» (правка в форме)
 * и «изменено» (значение отличается от стандартного на сервере). `labelOverride` — короткий заголовок в сгруппированном
 * редакторе (тексты бота). id `setting-<ключ>` нужен «Показать» в панели сохранения и поиску.
 */
export function SettingField({
  item,
  entry,
  onChange,
  onReset,
  labelOverride,
  view,
}: {
  item: SettingItem;
  entry: DraftEntry;
  onChange: (raw: string | boolean) => void;
  onReset: () => void;
  labelOverride?: string;
  view?: SettingView;
}) {
  const error = validate(item, entry.raw);
  const dirty = isDirty(item, entry);
  const atDefault = isDefault(item, entry);
  const changedAt = item.overridden ? formatIsoOrNull(item.updatedAt) : null;
  const wide = isWide(item);

  return (
    <div
      id={`setting-${item.key}`}
      className={cn(
        "card-2 min-w-0 scroll-mt-[96px] rounded-[var(--r-md)] p-3 transition-colors sm:p-4",
        dirty && "border-[rgba(255,102,0,.45)] shadow-[inset_2px_0_0_var(--accent)]"
      )}
    >
      {/* minmax(0,1fr): на телефоне колонка не растягивается под ширину поля ввода (вложенные карточки «Дополнительно» на 320). */}
      <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3", !wide && "sm:grid-cols-[minmax(0,1fr)_minmax(180px,260px)] sm:items-start sm:gap-x-6")}>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--text)]">{labelOverride ?? item.label}</span>
            {dirty && <Badge tone="accent">Не сохранено</Badge>}
            {!dirty && item.overridden && <Badge tone="neutral">Изменено</Badge>}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">{item.description}</p>
        </div>
        <SettingControl item={item} entry={entry} error={error} view={view} onChange={onChange} />
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-faint)]">
        <span className="min-w-0">
          По умолчанию:{" "}
          <b className="text-[var(--text-muted)]">
            {view ? `${view.toView(String(item.defaultValue))} ${view.unit}` : formatValue(item, item.defaultValue)}
          </b>
          {changedAt && !dirty && (
            <span className="block sm:inline">
              <span className="hidden sm:inline"> · </span>
              изменено {changedAt}
              {item.updatedBy ? `, ${item.updatedBy}` : ""}
            </span>
          )}
        </span>
        {!atDefault && (
          <button
            type="button"
            onClick={onReset}
            className="focusable hit inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
