"use client";

import { Button } from "@shop/ui/admin-button";
import { useMediaQuery } from "@shop/ui/use-media";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TAB_LABEL, TAB_LABEL_SHORT, TABS, type StateFilter } from "../model/promo";
import type { PromoOrigin } from "../model/types";

interface Props {
  tab: PromoOrigin;
  onTab: (t: PromoOrigin) => void;
  /** Число кодов во вкладках; `undefined` — пока список не загружен. */
  counts: Record<PromoOrigin, number> | undefined;
  query: string;
  onQuery: (q: string) => void;
  state: StateFilter;
  onState: (s: StateFilter) => void;
  onCreate: () => void;
}

/**
 * Один sticky-ряд управления: вкладки, поиск, «Все / Действуют / Не действуют», «+ Новый».
 * Подписи вкладок короче на телефоне — один контрол, а не два в DOM.
 */
export function PromoControls({ tab, onTab, counts, query, onQuery, state, onState, onCreate }: Props) {
  const wide = useMediaQuery("(min-width: 640px)", true);
  const labels = wide ? TAB_LABEL : TAB_LABEL_SHORT;
  return (
    <div className="sticky top-[calc(var(--safe-top)+58px)] z-20 -mx-4 mb-3 flex flex-col gap-2 bg-[var(--bg)]/90 px-4 py-2 backdrop-blur lg:top-[61px] lg:-mx-7 lg:px-7">
      {/* One row: on a phone «+» used to wrap onto a line of its own; now the tabs scroll (with a fade) instead. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <SegmentedControl<PromoOrigin>
            size={wide ? "md" : "sm"}
            value={tab}
            onChange={onTab}
            options={TABS.map((t) => ({ value: t, label: labels[t], count: counts?.[t] }))}
          />
        </div>
        <Button
          variant="accent"
          className="shrink-0"
          icon={<Plus className="h-4 w-4" />}
          onClick={onCreate}
          aria-label="Новый промокод"
        >
          <span className="max-sm:hidden">Новый промокод</span>
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
    </div>
  );
}
