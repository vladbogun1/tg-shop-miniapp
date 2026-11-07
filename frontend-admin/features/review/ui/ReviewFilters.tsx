"use client";

import { Search, Star, X } from "lucide-react";
import type { CSSProperties } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { countOf, extraFilterCount, FILTER_LABEL, RATINGS, REVIEW_FILTERS, toggleRating } from "../model/filters";
import type { AdminReviewPage, ReviewExtraFilters, ReviewFilter } from "../model/types";

const CHIP =
  "focusable inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[12.5px] transition-colors pointer-coarse:h-10";
const CHIP_OFF = "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--border-2)]";
const CHIP_ON = "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]";

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[var(--ring-accent)] sm:w-[260px] sm:flex-none pointer-coarse:h-11">
      <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск: текст, товар, покупатель, заказ"
        aria-label="Поиск по отзывам"
        title="Текст отзыва, имя покупателя, название товара или номер заказа"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
      />
      {value && (
        <button type="button" aria-label="Очистить поиск" onClick={() => onChange("")} className="focusable rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Оценки: несколько можно включить сразу (★1 и ★2 — «плохие»); ничего не включено — любые. */
function RatingChips({ value, onChange }: { value: number[]; onChange: (r: number[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Оценка">
      {RATINGS.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value.includes(r)}
          onClick={() => onChange(toggleRating(value, r))}
          className={cn(CHIP, value.includes(r) ? CHIP_ON : CHIP_OFF)}
        >
          <Star className="h-3.5 w-3.5" aria-hidden />
          {r}
        </button>
      ))}
    </div>
  );
}

/**
 * Вкладки статусов со счётчиками (на модерации / опубликованы / скрытые / все; счётчики считаются с учётом поиска,
 * оценок, «Без ответа» и товара), поиск, оценки, «Без ответа» и чип «Товар: …» с крестиком, пока открыт фильтр по товару.
 */
export function ReviewFilters({
  status,
  data,
  productId,
  productTitle,
  extra,
  onStatus,
  onSearch,
  onRatings,
  onUnanswered,
  onResetExtra,
  onClearProduct,
}: {
  status: ReviewFilter;
  data: AdminReviewPage | undefined;
  productId: string | null;
  productTitle: string | null;
  extra: ReviewExtraFilters;
  onStatus: (f: ReviewFilter) => void;
  onSearch: (q: string) => void;
  onRatings: (r: number[]) => void;
  onUnanswered: (v: boolean) => void;
  onResetExtra: () => void;
  onClearProduct: () => void;
}) {
  const active = extraFilterCount(extra);
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<ReviewFilter>
          value={status}
          onChange={onStatus}
          options={REVIEW_FILTERS.map((f) => ({ value: f, label: FILTER_LABEL[f], count: countOf(data, f) }))}
        />
        {productId && (
          <span className="chip-tint !bg-[var(--surface-3)] !pr-1" style={{ "--chip": "var(--text)" } as CSSProperties}>
            <span className="max-w-[220px] truncate">Товар: {productTitle}</span>
            <button
              type="button"
              onClick={onClearProduct}
              aria-label="Показать отзывы обо всех товарах"
              className="focusable grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--surface-hover)] pointer-coarse:h-9 pointer-coarse:w-9"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={extra.q} onChange={onSearch} />
        <RatingChips value={extra.ratings} onChange={onRatings} />
        <button
          type="button"
          aria-pressed={extra.unanswered}
          onClick={() => onUnanswered(!extra.unanswered)}
          className={cn(CHIP, extra.unanswered ? CHIP_ON : CHIP_OFF)}
        >
          Без ответа
        </button>
        {active > 0 && (
          <button type="button" onClick={onResetExtra} className="focusable text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text)]">
            Сбросить ({active})
          </button>
        )}
      </div>
    </div>
  );
}
