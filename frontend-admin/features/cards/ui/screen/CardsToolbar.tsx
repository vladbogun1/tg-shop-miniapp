"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Sheet } from "@shop/ui/overlay";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { useMediaQuery } from "@shop/ui/use-media";
import { CARD_SORT_OPTIONS, type CardSort } from "../../model/screen";
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

/** Фильтр витрины, сортировка и «Только неполные» (в «Готово»): одни и те же поля в панели на ПК и в шторке на телефоне. */
function FilterFields({ s, stacked }: { s: CardsScreenState; stacked: boolean }) {
  return (
    <div className={stacked ? "flex flex-col gap-4" : "flex flex-wrap items-end gap-3"}>
      <div className={stacked ? undefined : "w-[190px]"}>
        <Select<Vitrine>
          label="Витрина"
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
      <div className={stacked ? undefined : "w-[260px]"}>
        <Select<CardSort> label="Сортировка" value={s.sort} onChange={s.setSort} options={CARD_SORT_OPTIONS} />
      </div>
      {s.current === "ready" && (
        <div className="flex flex-wrap items-center gap-3 pb-2 text-[12.5px] text-[var(--text-muted)]">
          <Toggle checked={s.onlyIncomplete} onChange={s.setOnlyIncomplete} label={`Только неполные (${s.incompleteReady})`} />
          <span className="text-[var(--text-faint)]" title="Проверены, но не хватает обязательных характеристик">
            — не хватает обязательных характеристик
          </span>
        </div>
      )}
    </div>
  );
}

/** Сколько фильтров отличается от умолчания (витрина «в работе», сортировка «по вкладке», без «неполных»). */
export function activeFilterCount(s: Pick<CardsScreenState, "vitrine" | "sort" | "onlyIncomplete" | "current">): number {
  return (s.vitrine !== "work" ? 1 : 0) + (s.sort !== "tab" ? 1 : 0) + (s.current === "ready" && s.onlyIncomplete ? 1 : 0);
}

/** Вкладки со счётчиками, поиск и «Фильтры (N)»: панель под полосой на ПК, шторка на телефоне. */
export function CardsToolbar({ s }: { s: CardsScreenState }) {
  const phone = useMediaQuery("(max-width: 639px)", false);
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(s);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<CardTab>
          size={phone ? "sm" : "md"}
          value={s.current}
          onChange={s.switchTab}
          options={(["draft", "review", "ready"] as const).map((t) => ({ value: t, label: TAB_LABEL[t], count: s.counts[t] }))}
        />
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <SearchBox query={s.query} onQuery={s.setQuery} onClear={s.clearQuery} />
          <Button
            variant={open || n > 0 ? "surface" : "outline"}
            icon={<SlidersHorizontal className="h-4 w-4" />}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="shrink-0"
          >
            Фильтры{n > 0 ? ` · ${n}` : ""}
          </Button>
        </div>
      </div>
      {open && !phone && (
        <div className="mt-2 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-3">
          <FilterFields s={s} stacked={false} />
        </div>
      )}
      <Sheet open={open && phone} onClose={() => setOpen(false)} title="Фильтры" closeLabel="Закрыть">
        <div className="flex flex-col gap-4 px-4 pb-[calc(16px+var(--safe-bottom,0px))] pt-2">
          <FilterFields s={s} stacked />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={s.resetFilters}>
              Сбросить
            </Button>
            <Button variant="accent" className="flex-1" onClick={() => setOpen(false)}>
              Готово
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
