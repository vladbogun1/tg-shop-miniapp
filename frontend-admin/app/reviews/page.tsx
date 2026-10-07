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
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, MessageSquareText, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { ReviewCard, type ReviewAction } from "@/components/reviews/ReviewCard";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ApiError } from "@/lib/api";
import { refreshInbox } from "@/lib/inbox";
import { staggerContainer } from "@/lib/motion";
import {
  REVIEW_FILTERS,
  REVIEWS_PAGE_SIZE,
  REVIEWS_QUERY_KEY,
  reviewsApi,
  type AdminReview,
  type ReviewFilter,
} from "@/lib/reviews";
import { useToast } from "@/lib/toast";

const FILTER_LABEL: Record<ReviewFilter, string> = {
  PENDING: "На модерации",
  PUBLISHED: "Опубликованы",
  HIDDEN: "Скрытые",
  ALL: "Все",
};

const EMPTY_TEXT: Record<ReviewFilter, string> = {
  PENDING: "Новых отзывов на проверку нет.",
  PUBLISHED: "Опубликованных отзывов пока нет.",
  HIDDEN: "Скрытых отзывов нет.",
  ALL: "Покупатели ещё не оставили ни одного отзыва.",
};

function errText(e: unknown): string {
  return e instanceof ApiError ? e.message : "Ошибка";
}

export default function ReviewsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<ReviewFilter>("PENDING");
  const [productId, setProductId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<{ id: number; action: ReviewAction } | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  // URL → state, once.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const s = sp.get("status")?.toUpperCase() as ReviewFilter | undefined;
    if (s && REVIEW_FILTERS.includes(s)) setStatus(s);
    const p = sp.get("productId");
    if (p) setProductId(p);
    setReady(true);
  }, []);

  // State → URL (so a reload / a shared link keeps the filter).
  useEffect(() => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (status !== "PENDING") sp.set("status", status);
    if (productId) sp.set("productId", productId);
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [ready, status, productId]);

  const q = useQuery({
    queryKey: [...REVIEWS_QUERY_KEY, status, productId, page],
    queryFn: () => reviewsApi.list({ status, productId, page, size: REVIEWS_PAGE_SIZE }),
    enabled: ready,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
  const data = q.data;
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;

  // A page emptied by the last action (e.g. published the last pending one) → step back.
  useEffect(() => {
    if (data && page > 0 && data.items.length === 0 && page >= data.totalPages) {
      setPage(Math.max(0, data.totalPages - 1));
    }
  }, [data, page]);

  const countOf = (f: ReviewFilter): number | undefined => {
    if (!data) return undefined;
    if (f === "PENDING") return data.pendingCount;
    if (f === "PUBLISHED") return data.publishedCount;
    if (f === "HIDDEN") return data.hiddenCount;
    return data.pendingCount + data.publishedCount + data.hiddenCount;
  };

  function pickStatus(f: ReviewFilter) {
    setStatus(f);
    setPage(0);
  }

  function clearProduct() {
    setProductId(null);
    setPage(0);
  }

  function refresh() {
    void qc.invalidateQueries({ queryKey: REVIEWS_QUERY_KEY });
    refreshInbox(qc);
  }

  async function run(r: AdminReview, action: ReviewAction, call: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy({ id: r.id, action });
    try {
      await call();
      push(ok, "ok");
      refresh();
      return true;
    } catch (e) {
      push(errText(e), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  function publish(r: AdminReview) {
    void run(
      r,
      "publish",
      () => reviewsApi.publish(r.id),
      r.orderId
        ? "Отзыв опубликован. Если это первый отзыв по заказу, покупателю может быть отправлен бонусный промокод"
        : "Отзыв опубликован"
    );
  }

  function hide(r: AdminReview) {
    void run(r, "hide", () => reviewsApi.hide(r.id), "Отзыв скрыт с витрины");
  }

  function reply(r: AdminReview, text: string): Promise<boolean> {
    return run(r, "reply", () => reviewsApi.reply(r.id, text), text ? "Ответ сохранён" : "Ответ убран");
  }

  async function remove(r: AdminReview) {
    const ok = await confirm({
      title: "Удалить отзыв?",
      message:
        "Отзыв исчезнет навсегда, покупатель сможет оставить новый на этот товар. Чтобы просто убрать его с витрины, лучше скройте.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    void run(r, "delete", () => reviewsApi.remove(r.id), "Отзыв удалён");
  }

  const productTitle = productId ? (items.find((r) => r.productId === productId)?.productTitle ?? "Товар") : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Отзывы"
        subtitle="Модерация отзывов о товарах: публикация, ответы магазина"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl<ReviewFilter>
          value={status}
          onChange={pickStatus}
          options={REVIEW_FILTERS.map((f) => ({ value: f, label: FILTER_LABEL[f], count: countOf(f) }))}
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
              <ReviewCard
                key={r.id}
                review={r}
                busy={busy?.id === r.id ? busy.action : null}
                onPublish={() => publish(r)}
                onHide={() => hide(r)}
                onReply={(text) => reply(r, text)}
                onDelete={() => void remove(r)}
                onOpenOrder={setOpenOrderId}
              />
            ))}
          </motion.ul>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <span className="field-label tabular mr-1 !text-[11px] !text-[var(--text-faint)]">
              Стр. {page + 1} из {totalPages}
              {q.isFetching ? " · …" : ""}
            </span>
            <Button
              variant="surface"
              size="icon"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              icon={<ChevronLeft className="h-4 w-4" />}
              aria-label="Назад"
            />
            <Button
              variant="surface"
              size="icon"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              icon={<ChevronRight className="h-4 w-4" />}
              aria-label="Вперёд"
            />
          </div>
        )}
      </QueryState>

      {confirmUi}
      <OrderDrawer orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
    </div>
  );
}
