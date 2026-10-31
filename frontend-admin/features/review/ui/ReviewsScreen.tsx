"use client";

/**
 * «Отзывы» (route "/reviews", Phase C / V44) — moderation of product reviews.
 *
 *  - GET /api/admin/reviews?status=&productId=&page=&size=, newest first; the filter chips show
 *    the per-status counts from the same answer.
 *  - Deep links: /reviews?status=PENDING (from «Внимание»), /reviews?productId=<uuid> (one product).
 *    Read once from the URL (no useSearchParams: it would force a Suspense boundary) and kept in
 *    sync with replaceState.
 *  - Actions: Опубликовать (the first published review of an order may give the customer a personal
 *    bonus code — the server decides), Скрыть, Ответить (public reply; empty = remove), Удалить.
 *    After each one the list and «Внимание» are refetched.
 *
 * The OrderDrawer comes from the page (`renderOrderDrawer`): the feature does not import orders.
 */
import { motion } from "framer-motion";
import { MessageSquareText, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIsSuperAdmin } from "@/features/staff";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { staggerContainer } from "@/lib/motion";
import {
  countOf,
  EMPTY_TEXT,
  FILTER_LABEL,
  pageAfterEmptied,
  parseReviewFilter,
  REVIEW_FILTERS,
  reviewsSearch,
} from "../model/filters";
import type { ReviewFilter } from "../model/types";
import { useReviewsList } from "../queries";
import { ReviewRow } from "./ReviewRow";
import { ReviewsPager } from "./ReviewsPager";

export function ReviewsScreen({
  renderOrderDrawer,
}: {
  renderOrderDrawer: (orderId: string | null, onClose: () => void) => ReactNode;
}) {
  const superAdmin = useIsSuperAdmin();

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ReviewFilter>("PENDING");
  const [productId, setProductId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // URL → state, once.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = parseReviewFilter(sp.get("status"));
    if (s) setStatus(s);
    const p = sp.get("productId");
    if (p) setProductId(p);
    setReady(true);
  }, []);

  // State → URL (so a reload / a shared link keeps the filter).
  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, "", window.location.pathname + reviewsSearch(status, productId));
  }, [ready, status, productId]);

  const q = useReviewsList(status, productId, page, ready);
  const data = q.data;
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;

  // A page emptied by the last action (e.g. published the last pending one) → step back.
  useEffect(() => {
    const back = pageAfterEmptied(data, page);
    if (back !== null) setPage(back);
  }, [data, page]);

  function pickStatus(f: ReviewFilter) {
    setStatus(f);
    setPage(0);
  }

  function clearProduct() {
    setProductId(null);
    setPage(0);
  }

  const productTitle = productId ? (items.find((r) => r.productId === productId)?.productTitle ?? "Товар") : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Отзывы" subtitle="Модерация отзывов о товарах: публикация, ответы магазина" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl<ReviewFilter>
          value={status}
          onChange={pickStatus}
          options={REVIEW_FILTERS.map((f) => ({ value: f, label: FILTER_LABEL[f], count: countOf(data, f) }))}
        />
        {productId && (
          <span className="chip-tint !bg-[var(--surface-3)] !pr-1" style={{ "--chip": "var(--text)" } as CSSProperties}>
            <span className="max-w-[220px] truncate">Товар: {productTitle}</span>
            <button
              type="button"
              onClick={clearProduct}
              aria-label="Показать отзывы обо всех товарах"
              className="focusable grid h-5 w-5 place-items-center rounded-full hover:bg-[var(--surface-hover)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      <QueryState
        isLoading={!ready || q.isLoading}
        isError={q.isError}
        error={q.error}
        refetch={() => q.refetch()}
        loadingLabel="Загрузка отзывов"
      >
        {items.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="Отзывов нет"
            description={productId ? "Об этом товаре в этом разделе отзывов нет." : EMPTY_TEXT[status]}
          />
        ) : (
          <motion.ul
            key={`${status}-${productId ?? ""}-${page}`}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="flex flex-col gap-3"
          >
            {items.map((r) => (
              <ReviewRow key={r.id} review={r} canDelete={superAdmin === true} onOpenOrder={setOpenOrderId} />
            ))}
          </motion.ul>
        )}

        <ReviewsPager page={page} totalPages={totalPages} fetching={q.isFetching} onPage={setPage} />
      </QueryState>

      {renderOrderDrawer(openOrderId, () => setOpenOrderId(null))}
    </div>
  );
}
