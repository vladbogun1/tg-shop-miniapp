"use client";

import { Search, X } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { useMediaQuery } from "@shop/ui/use-media";
import { TAB_LABEL, type CardTab, type Vitrine } from "../../model/view";
import type { CardsScreenState } from "./use-cards-screen";

function SearchBox({ query, onQuery, onClear }: { query: string; onQuery: (q: string) => void; onClear: () => void }) {
  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[var(--ring-accent)] sm:w-[240px] sm:flex-none pointer-coarse:h-11">
      <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Поиск"
        title="Поиск по названию, бренду, категории"
        aria-label="Поиск карточек"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
      />
      {query && (
        <button type="button" aria-label="Очистить поиск" onClick={onClear} className="focusable rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Вкладки по статусу, поиск, фильтр витрины и «Только неполные» в «Готово». */
export function CardsToolbar({ s }: { s: CardsScreenState }) {
  const phone = useMediaQuery("(max-width: 639px)", false);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedControl<CardTab>
          size={phone ? "sm" : "md"}
          value={s.current}
          onChange={s.switchTab}
          options={(["draft", "review", "ready"] as const).map((t) => ({ value: t, label: TAB_LABEL[t], count: s.counts[t] }))}
        />
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchBox query={s.query} onQuery={s.setQuery} onClear={s.clearQuery} />
          <Select<Vitrine>
            className="w-[170px] shrink-0"
            value={s.vitrine}
            onChange={s.setVitrine}
            options={[
              { value: "work", label: "В работе" },
              { value: "all", label: "Все, со старыми" },
              { value: "live", label: "На витрине" },
              { value: "hidden", label: "Скрытые" },
            ]}
          />
        </div>
      </div>
      {s.current === "ready" && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--text-muted)]">
          <Toggle checked={s.onlyIncomplete} onChange={s.setOnlyIncomplete} label={`Только неполные (${s.incompleteReady})`} />
          <span className="text-[var(--text-faint)]">— проверены, но не хватает обязательных характеристик</span>
        </div>
      )}
    </>
  );
}
