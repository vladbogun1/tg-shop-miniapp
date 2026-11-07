"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { pageAfterEmptied, parseRatings, parseReviewFilter, reviewsSearch } from "../model/filters";
import { pickAfterRemoval } from "../model/moderation";
import type { AdminReviewPage, ReviewFilter } from "../model/types";

/**
 * Фильтр экрана (статус, товар, поиск, оценки, «Без ответа», страница), синхронный с URL: читается один раз при
 * открытии (без useSearchParams — он потребовал бы Suspense) и пишется обратно через replaceState, чтобы перезагрузка
 * и ссылка сохраняли фильтр. Поиск уходит на сервер с задержкой (`q`), а в поле (`search`) обновляется сразу.
 * Любое изменение фильтра возвращает на первую страницу.
 */
export function useReviewFilterState() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ReviewFilter>("PENDING");
  const [productId, setProductId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ratings, setRatings] = useState<number[]>([]);
  const [unanswered, setUnanswered] = useState(false);
  const [page, setPage] = useState(0);
  const q = useDebounced(search.trim());
  const ratingsKey = ratings.join(",");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = parseReviewFilter(sp.get("status"));
    if (s) setStatus(s);
    const p = sp.get("productId");
    if (p) setProductId(p);
    setSearch(sp.get("q") ?? "");
    setRatings(parseRatings(sp.get("ratings")));
    setUnanswered(sp.get("unanswered") === "1");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, "", window.location.pathname + reviewsSearch(status, productId, { q, ratings, unanswered }));
  }, [ready, status, productId, q, ratings, unanswered]);

  // Новый поисковый запрос, оценки или «Без ответа» — страница с номером прошлой выдачи уже не имеет смысла.
  useEffect(() => {
    setPage(0);
  }, [q, ratingsKey, unanswered]);

  return {
    ready,
    status,
    setStatus,
    productId,
    setProductId,
    search,
    setSearch,
    q,
    ratings,
    setRatings,
    unanswered,
    setUnanswered,
    page,
    setPage,
  };
}

/**
 * Какой отзыв открыт. Выбранный пропал (опубликовали, скрыли, удалили) — открывается следующий за ним;
 * на ноутбуке всегда открыт какой-то отзыв, на телефоне — только по нажатию. Страница опустела — шаг назад.
 */
export function useReviewSelection(ids: number[], desktop: boolean, data: AdminReviewPage | undefined, page: number, setPage: (p: number) => void) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const prevIds = useRef<number[]>([]);
  // Срабатываем по составу списка, а не по новому массиву на каждый рендер.
  const idsKey = ids.join(",");
  const list = useMemo(() => (idsKey ? idsKey.split(",").map(Number) : []), [idsKey]);

  useEffect(() => {
    const back = pageAfterEmptied(data, page);
    if (back !== null) setPage(back);
  }, [data, page, setPage]);

  useEffect(() => {
    if (selectedId != null && !list.includes(selectedId)) setSelectedId(pickAfterRemoval(prevIds.current, list, selectedId));
    else if (selectedId == null && desktop && list.length > 0) setSelectedId(list[0]);
    prevIds.current = list;
  }, [list, selectedId, desktop]);

  return { selectedId, setSelectedId };
}
