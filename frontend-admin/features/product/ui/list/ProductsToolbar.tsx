"use client";

/**
 * Полоса поиска и фильтров над списком товаров: поиск · «Фильтры (N)» · вид; под ней чипы статусов с числами и чипы
 * включённых фильтров с «×». Сами фильтры (категория, бренд, карточка, состояние, сортировка) — панель под полосой
 * на ПК и нижняя шторка на телефоне.
 */
import { LayoutGrid, List as ListIcon, Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { Sheet } from "@shop/ui/overlay";
import { useMediaQuery } from "@shop/ui/use-media";
import { CategoryTreeSelect, CONDITION_LABEL, CONDITION_OPTIONS } from "@/features/catalog";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { NO_BRAND, NO_CATEGORY, SORT_OPTIONS, type CardFilter, type StatusFilter, type ViewMode } from "../../model/list";
import type { ProductsScreenState } from "./use-products-screen";

const CARD_LABEL: Record<Exclude<CardFilter, "">, string> = { DRAFT: "Черновик", AI_FILLED: "От ИИ", READY: "Проверена", INCOMPLETE: "Неполная" };

function FilterFields({ s, stacked }: { s: ProductsScreenState; stacked: boolean }) {
  const brandOptions = [
    { value: "", label: "Все бренды" },
    { value: NO_BRAND, label: "Без бренда" },
    ...[...s.brands].sort((a, b) => a.name.localeCompare(b.name)).map((b) => ({ value: b.id, label: `${b.name} · ${b.productCount}` })),
  ];
  return (
    <div className={stacked ? "flex flex-col gap-4" : "grid grid-cols-2 items-end gap-3 xl:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_1fr_1fr]"}>
      <CategoryTreeSelect
        className={stacked ? undefined : "col-span-2 xl:col-span-1"}
        label="Категория"
        mode="any"
        showCounts
        categories={s.categories}
        value={s.categoryId}
        onChange={s.setCategoryId}
        placeholder="Все категории"
        extra={[
          { value: "", label: "Все категории" },
          { value: NO_CATEGORY, label: "Без категории" },
        ]}
      />
      <Select label="Бренд" value={s.brandId} onChange={s.setBrandId} placeholder="Все бренды" options={brandOptions} />
      <Select<CardFilter>
        label="Карточка"
        value={s.cardFilter}
        onChange={s.setCardFilter}
        placeholder="Любая"
        options={[{ value: "", label: "Любая" }, ...(Object.keys(CARD_LABEL) as Exclude<CardFilter, "">[]).map((v) => ({ value: v, label: CARD_LABEL[v] }))]}
      />
      <Select<"" | "NEW" | "MARKDOWN" | "USED">
        label="Состояние"
        value={s.condition}
        onChange={s.setCondition}
        placeholder="Любое"
        options={[{ value: "", label: "Любое" }, ...CONDITION_OPTIONS]}
      />
      <Select label="Сортировка" value={s.sort} onChange={s.setSort} options={SORT_OPTIONS} />
    </div>
  );
}

/** Включённые фильтры в виде чипов: видно, что отфильтровано, и снимается одним нажатием. */
function ActiveChips({ s }: { s: ProductsScreenState }) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (s.categoryId) chips.push({ key: "cat", label: s.categoryId === NO_CATEGORY ? "Без категории" : (s.categories.find((c) => c.id === s.categoryId)?.name ?? "Категория"), clear: () => s.setCategoryId("") });
  if (s.brandId) chips.push({ key: "brand", label: s.brandId === NO_BRAND ? "Без бренда" : (s.brands.find((b) => b.id === s.brandId)?.name ?? "Бренд"), clear: () => s.setBrandId("") });
  if (s.cardFilter) chips.push({ key: "card", label: `Карточка: ${CARD_LABEL[s.cardFilter]}`, clear: () => s.setCardFilter("") });
  if (s.condition) chips.push({ key: "cond", label: CONDITION_LABEL[s.condition], clear: () => s.setCondition("") });
  if (!chips.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={c.clear} aria-label={`Снять фильтр: ${c.label}`} className="chip-tint focusable inline-flex items-center gap-1 pointer-coarse:min-h-9">
          {c.label}
          <X className="h-3 w-3" />
        </button>
      ))}
      <button type="button" onClick={s.resetFilters} className="focusable px-1.5 text-[12px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text)] hover:underline">
        Сбросить всё
      </button>
    </div>
  );
}

function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  const btn = (v: ViewMode, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-label={label}
      aria-pressed={view === v}
      className={cn(
        "hit grid h-full w-9 place-items-center rounded-[var(--r-sm)] border transition-colors pointer-coarse:w-11",
        view === v ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
      )}
    >
      {icon}
    </button>
  );
  return (
    <div className="inline-flex h-10 shrink-0 items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px] pointer-coarse:h-11">
      {btn("list", "Список", <ListIcon className="h-4 w-4" />)}
      {btn("cards", "Карточки", <LayoutGrid className="h-4 w-4" />)}
    </div>
  );
}

export function ProductsToolbar({ s }: { s: ProductsScreenState }) {
  const phone = useMediaQuery("(max-width: 639px)", false);
  const [open, setOpen] = useState(false);
  const n = s.activeFilters;
  return (
    <>
      {/* Phone: search on its own row — next to «Фильтры» and the view toggle it was cut to «Поиск п…». */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-0 flex-1 items-center gap-2 max-sm:basis-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[var(--ring-accent)] sm:max-w-[360px] pointer-coarse:h-11">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            placeholder="Поиск по названию или бренду"
            aria-label="Поиск по названию"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          {s.search && (
            <button type="button" aria-label="Очистить поиск" onClick={() => s.setSearch("")} className="focusable rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant={open || n > 0 ? "surface" : "outline"} icon={<SlidersHorizontal className="h-4 w-4" />} aria-expanded={open} onClick={() => setOpen((v) => !v)} className="shrink-0">
          Фильтры{n > 0 ? ` · ${n}` : ""}
        </Button>
        <div className="ml-auto" />
        <ViewToggle view={s.view} setView={s.setView} />
      </div>
      {!s.archivedView && (
        <div className="thin-scroll -mx-1 mt-2 max-w-full overflow-x-auto px-1 pb-1">
          <SegmentedControl<StatusFilter> size={phone ? "sm" : "md"} options={s.statusChips} value={s.status} onChange={s.setStatus} className="whitespace-nowrap" />
        </div>
      )}
      <ActiveChips s={s} />
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
