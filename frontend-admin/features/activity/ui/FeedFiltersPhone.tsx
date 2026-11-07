"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { activeFilterCount } from "../model/filter";
import type { ActivityFacets, ActivityFilter } from "../model/types";
import { FeedFilters } from "./FeedFilters";
import type { FeedFields, FeedShared } from "./use-feed-filters";

const RESULT_CHIPS = [
  { value: "", label: "Все" },
  { value: "OK", label: "Успешно" },
  { value: "FAILED", label: "Ошибки" },
  { value: "SKIPPED", label: "Пропущено" },
];

interface Props {
  shared: FeedShared;
  fields: FeedFields;
  setField: (key: keyof FeedFields, value: string) => void;
  facets: ActivityFacets | undefined;
  typeOptions: { value: string; label: string }[];
  filter: ActivityFilter;
  filtered: boolean;
  onReset: () => void;
  open: boolean;
  setOpen: (v: boolean) => void;
}

/** Телефон: поиск и чипы результата всегда на виду, остальные поля — в шторке «Фильтры (N)». */
export function FeedFiltersPhone({ shared, fields, setField, facets, typeOptions, filter, filtered, onReset, open, setOpen }: Props) {
  const n = activeFilterCount(filter);
  return (
    <div className="mb-3 flex flex-col gap-2.5">
      <Input
        placeholder="текст, @username, имя, Telegram id"
        icon={<Search className="h-4 w-4" />}
        value={fields.qRaw}
        onChange={(e) => setField("qRaw", e.target.value)}
        aria-label="Поиск по журналу"
      />
      <div className="flex items-center gap-2">
        <div className="thin-scroll -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1">
          {RESULT_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => shared.setResult(c.value)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold",
                shared.result === c.value
                  ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button variant="surface" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setOpen(true)} className="shrink-0">
          Фильтры{n > 0 ? ` (${n})` : ""}
        </Button>
      </div>
      <ActionSheet open={open} title="Фильтры ленты" onClose={() => setOpen(false)}>
        <div className="mb-3 max-h-[60vh] overflow-y-auto pr-0.5">
          <FeedFilters
            bare
            shared={shared}
            fields={fields}
            setField={setField}
            facets={facets}
            typeOptions={typeOptions}
            filtered={filtered}
            onReset={onReset}
          />
        </div>
        <Button variant="accent" className="w-full" onClick={() => setOpen(false)}>
          Показать
        </Button>
      </ActionSheet>
    </div>
  );
}
