"use client";

import { cn } from "@/lib/cn";
import { isDirty, validate, type Draft, type SettingItem } from "@/features/settings";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";

export type FieldProps = { item: SettingItem; entry: Draft[string] };

export function NumField({
  item,
  entry,
  label,
  hideHint,
  onChange,
}: FieldProps & { label: string; hideHint?: boolean; onChange: (raw: string) => void }) {
  const error = validate(item, entry.raw) ?? undefined;
  const dirty = isDirty(item, entry);
  const range = item.min != null && item.max != null ? `${item.min}…${item.max}` : null;
  return (
    <div className={cn("min-w-0", dirty && "[&_.group]:!border-[rgba(255,102,0,.55)]")}>
      <Input
        label={label}
        inputMode="numeric"
        value={String(entry.raw)}
        onChange={(e) => onChange(e.target.value.replace(/[^\d-]/g, ""))}
        error={error}
        hint={hideHint ? undefined : [item.description, range && !item.description?.includes(range) ? `(${range})` : null].filter(Boolean).join(" ") || undefined}
        rightSlot={
          item.unit ? (
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">{item.unit}</span>
          ) : undefined
        }
      />
    </div>
  );
}

export function BoolRow({ item, entry, label, onChange }: FieldProps & { label: string; onChange: (v: boolean) => void }) {
  const dirty = isDirty(item, entry);
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <Toggle checked={Boolean(entry.raw)} onChange={onChange} label={label} />
      {dirty && <Badge tone="accent">Не сохранено</Badge>}
    </div>
  );
}
