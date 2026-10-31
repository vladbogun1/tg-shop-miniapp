"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TAB_LABEL, TAB_LABEL_SHORT, TABS, type StateFilter } from "../model/promo";
import type { PromoOrigin } from "../model/types";

interface TabsProps {
  tab: PromoOrigin;
  onTab: (t: PromoOrigin) => void;
  /** Число кодов во вкладках; `undefined` — пока список не загружен. */
  counts: Record<PromoOrigin, number> | undefined;
}

/**
 * Two copies, one per width: the full labels do not fit a phone in one row. The wrappers hide
 * them — SegmentedControl's own `inline-flex` would win over a `hidden` passed in.
 */
export function PromoTabs({ tab, onTab, counts }: TabsProps) {
  return (
    <>
      <div className="mb-3 sm:hidden">
        <SegmentedControl<PromoOrigin>
          size="sm"
          value={tab}
          onChange={onTab}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL_SHORT[t], count: counts?.[t] }))}
        />
      </div>
      <div className="mb-3 hidden sm:block">
        <SegmentedControl<PromoOrigin>
          value={tab}
          onChange={onTab}
          options={TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: counts?.[t] }))}
        />
      </div>
    </>
  );
}

interface FiltersProps {
  tab: PromoOrigin;
  query: string;
  onQuery: (q: string) => void;
  state: StateFilter;
  onState: (s: StateFilter) => void;
}

export function PromoFilters({ tab, query, onQuery, state, onState }: FiltersProps) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <Input
          aria-label="Поиск промокода"
          placeholder={tab === "PERSONAL" ? "Код, клиент, № заказа или Telegram id" : "Код или Telegram id"}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          icon={<Search className="h-4 w-4" />}
        />
      </div>
      <SegmentedControl<StateFilter>
        size="sm"
        value={state}
        onChange={onState}
        options={[
          { value: "all", label: "Все" },
          { value: "live", label: "Действуют" },
          { value: "off", label: "Не действуют" },
        ]}
      />
    </div>
  );
}
