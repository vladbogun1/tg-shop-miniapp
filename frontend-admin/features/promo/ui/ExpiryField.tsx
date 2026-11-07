"use client";

import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { expiryAfterDays, shopToday } from "../model/form";

const CHIPS = [7, 30, 90];

/** «Срок до»: дата + быстрые чипы 7 / 30 / 90 дн. и «Без срока» (пусто — бессрочный). */
export function ExpiryField({ value, error, onChange }: { value: string; error?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        label="Срок до"
        type="date"
        value={value}
        min={shopToday()}
        error={error}
        hint={value ? "Действует до конца этого дня." : "Пусто — код не истекает."}
        onChange={(e) => onChange(e.target.value)}
        icon={<CalendarDays className="h-4 w-4" />}
      />
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((d) => {
          const day = expiryAfterDays(d);
          return (
            <Chip key={d} on={value === day} onClick={() => onChange(day)}>
              {`${d} дн.`}
            </Chip>
          );
        })}
        <Chip on={!value} onClick={() => onChange("")}>
          Без срока
        </Chip>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "focusable hit min-h-[36px] rounded-full border px-3.5 text-[13px] font-semibold pointer-coarse:min-h-[44px]",
        on
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
      )}
    >
      {children}
    </button>
  );
}
