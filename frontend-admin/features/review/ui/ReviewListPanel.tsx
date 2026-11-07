"use client";

import type { AdminReview } from "../model/types";
import { ReviewQueue } from "./ReviewQueue";
import { ReviewsPager } from "./ReviewsPager";

const HOTKEYS_HINT = "J / K — выбор · P — опубликовать · H — скрыть · R — ответ · Del — удалить";

/** Колонка очереди: список отзывов (на ноутбуке с собственной прокруткой), страницы по 30 и подсказка клавиш. */
export function ReviewListPanel({
  items,
  selectedId,
  showStatus,
  unsaved,
  page,
  totalPages,
  fetching,
  desktop,
  onSelect,
  onPage,
}: {
  items: AdminReview[];
  selectedId: number | null;
  showStatus: boolean;
  unsaved: Set<number>;
  page: number;
  totalPages: number;
  fetching: boolean;
  desktop: boolean;
  onSelect: (id: number) => void;
  onPage: (page: number) => void;
}) {
  return (
    <section className="panel min-w-0 p-2" aria-label="Очередь">
      <div className="thin-scroll lg:max-h-[calc(100dvh-230px)] lg:overflow-y-auto">
        <ReviewQueue items={items} selectedId={selectedId} showStatus={showStatus} unsaved={unsaved} onSelect={onSelect} />
      </div>
      <ReviewsPager page={page} totalPages={totalPages} fetching={fetching} onPage={onPage} />
      {desktop && <p className="px-2 pb-1 pt-2 text-[11.5px] text-[var(--text-faint)]">{HOTKEYS_HINT}</p>}
    </section>
  );
}
