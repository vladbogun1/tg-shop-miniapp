"use client";

import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import type { SettingItem } from "@/lib/settings";
import { formatDateTime, formatValue, isDefault, isDirty, validate, type DraftEntry } from "./draft";

/**
 * One setting: label + hint, the control for its type, "по умолчанию: …" with a reset button,
 * and who changed it last. `labelOverride` lets a grouped editor (bot texts) show a shorter title.
 */
export function SettingField({
  item,
  entry,
  onChange,
  onReset,
  labelOverride,
}: {
  item: SettingItem;
  entry: DraftEntry;
  onChange: (raw: string | boolean) => void;
  onReset: () => void;
  labelOverride?: string;
}) {
  const error = validate(item, entry.raw);
  const dirty = isDirty(item, entry);
  const atDefault = isDefault(item, entry);
  const changedAt = item.overridden ? formatDateTime(item.updatedAt) : null;

  const control =
    item.type === "BOOL" ? (
      <Toggle checked={Boolean(entry.raw)} onChange={onChange} label={entry.raw ? "Включено" : "Выключено"} />
    ) : item.type === "INT" ? (
      <div className="w-full max-w-[220px]">
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
    ) : item.type === "TEXT" ? (
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
    ) : (
      <div className="w-full">
        <Input
          aria-label={item.label}
          value={String(entry.raw)}
          onChange={(e) => onChange(e.target.value)}
          error={error ?? undefined}
        />
      </div>
    );

  return (
    <div
      className={cn(
        "card-2 flex min-w-0 flex-col gap-3 rounded-[var(--r-md)] p-4 transition-colors",
        dirty && "border-[rgba(255,102,0,.45)] shadow-[inset_2px_0_0_var(--accent)]"
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-[var(--text)]">{labelOverride ?? item.label}</div>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">{item.description}</p>
        </div>
        {dirty && <Badge tone="accent">Не сохранено</Badge>}
      </div>

      {control}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--text-faint)]">
        <span className="min-w-0">
          По умолчанию: <b className="text-[var(--text-muted)]">{formatValue(item, item.defaultValue)}</b>
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
            className="focusable inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 font-display text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
