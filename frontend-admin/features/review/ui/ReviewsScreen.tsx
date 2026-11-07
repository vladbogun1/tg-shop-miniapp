"use client";

/**
 * «Отзывы» (route "/reviews") — модерация отзывов о товарах: очередь слева, открытый отзыв справа.
 *
 *  - GET /api/admin/reviews?status=&productId=&q=&ratings=&unanswered=&page=&size=, новые первыми; счётчики на вкладках —
 *    из того же ответа (с учётом поиска, оценок и «Без ответа»). Поиск — на сервере, с задержкой.
 *  - Ссылки: /reviews?status=PENDING (из «Внимание»), /reviews?productId=<uuid> (один товар), ?q=, ?ratings=1,2, ?unanswered=1. Читаются один раз
 *    из URL (без useSearchParams: он потребовал бы Suspense) и синхронизируются через replaceState.
 *  - Действия: Опубликовать (первый опубликованный отзыв заказа может дать покупателю бонусный промокод — решает
 *    сервер), Скрыть, Ответить (публичный ответ; пустой = убрать), Удалить (главный админ, с подтверждением).
 *    Опубликованный отзыв «вернуть на модерацию» нельзя — на бэкенде нет такого перехода, поэтому «Отменить» не обещаем.
 *  - Ноутбук: клавиши J/K, P, H, R, Del; после действия открывается следующий отзыв. Телефон: список, отзыв — в шторке.
 *  - Черновики ответов живут в памяти страницы и не теряются при переходе к другому отзыву.
 *
 * OrderDrawer приходит со страницы (`renderOrderDrawer`): фича не импортирует заказы.
 */
import { MessageSquareText } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { useIsSuperAdmin } from "@/features/staff";
import { useIsDesktop } from "@/lib/use-media";
import { useConfirm } from "@shop/ui/confirm";
import { busyOn, EMPTY_TEXT, extraFilterCount, productTitleOf } from "../model/filters";
import { hasUnsavedReply, useReplyDrafts } from "../model/drafts";
import { neighborId } from "../model/moderation";
import type { ReviewFilter } from "../model/types";
import { useReviewActions, useReviewsList } from "../queries";
import { ReviewFilters } from "./ReviewFilters";
import { ReviewPane } from "./ReviewPane";
import { ReviewListPanel } from "./ReviewListPanel";
import { useReviewOps } from "./use-review-ops";
import { useReviewHotkeys } from "./use-review-hotkeys";
import { useReviewFilterState, useReviewSelection } from "./use-review-view";


export function ReviewsScreen({
  renderOrderDrawer,
}: {
  renderOrderDrawer: (orderId: string | null, onClose: () => void) => ReactNode;
}) {
  const superAdmin = useIsSuperAdmin() === true;
  const desktop = useIsDesktop();
  const confirm = useConfirm();
  const { busy, run, replyAndPublish } = useReviewActions();
  const { drafts, set: setDraft } = useReplyDrafts();

  const { ready, status, setStatus, productId, setProductId, search, setSearch, q, ratings, setRatings, unanswered, setUnanswered, page, setPage } =
    useReviewFilterState();
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const replyRef = useRef<HTMLTextAreaElement | null>(null);

  const list = useReviewsList({ status, productId, q, ratings, unanswered, page }, ready);
  const data = list.data;
  const extraCount = extraFilterCount({ q, ratings, unanswered });
  const items = useMemo(() => data?.items ?? [], [data]);
  const ids = useMemo(() => items.map((r) => r.id), [items]);
  const { selectedId, setSelectedId } = useReviewSelection(ids, desktop, data, page, setPage);

  const selected = items.find((r) => r.id === selectedId) ?? null;
  const unsaved = useMemo(() => new Set(items.filter((r) => hasUnsavedReply(r, drafts)).map((r) => r.id)), [items, drafts]);
  const busyFor = busyOn(busy, selected);
  const productTitle = productTitleOf(items, productId);

  function pickStatus(f: ReviewFilter) {
    setStatus(f);
    setPage(0);
    setSelectedId(null);
  }

  function resetExtra() {
    setSearch("");
    setRatings([]);
    setUnanswered(false);
    setSelectedId(null);
  }

  function clearProduct() {
    setProductId(null);
    setPage(0);
    setSelectedId(null);
  }

  function changePage(p: number) {
    setPage(p);
    setSelectedId(null);
  }

  const ops = useReviewOps({ run, replyAndPublish, superAdmin, confirm });
  const paneProps = {
    review: selected,
    desktop,
    drafts,
    busy: busyFor,
    canDelete: superAdmin,
    textareaRef: replyRef,
    ops,
    onDraft: setDraft,
    onOpenOrder: setOpenOrderId,
    onClose: () => setSelectedId(null),
  };
  const focusReply = () => replyRef.current?.focus();
  useReviewHotkeys(desktop && !!selected, {
    next: () => setSelectedId((id) => neighborId(ids, id, 1)),
    prev: () => setSelectedId((id) => neighborId(ids, id, -1)),
    publish: () => selected && ops.publish(selected),
    hide: () => selected && ops.hide(selected),
    reply: focusReply,
    remove: () => selected && ops.remove(selected),
  });

  return (
    <div className="min-w-0">
      <PageHeader title="Отзывы" subtitle="Модерация отзывов о товарах: публикация, ответы магазина" />

      <ReviewFilters
        status={status}
        data={data}
        productId={productId}
        productTitle={productTitle}
        extra={{ q: search, ratings, unanswered }}
        onStatus={pickStatus}
        onSearch={setSearch}
        onRatings={setRatings}
        onUnanswered={setUnanswered}
        onResetExtra={resetExtra}
        onClearProduct={clearProduct}
      />

      <QueryState
        isLoading={!ready || list.isLoading}
        isError={list.isError}
        error={list.error}
        refetch={() => list.refetch()}
        loadingLabel="Загрузка отзывов"
      >
        {items.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="Отзывов нет"
            description={
              extraCount > 0
                ? "Под выбранные поиск и фильтры отзывов не нашлось."
                : productId
                  ? "Об этом товаре в этом разделе отзывов нет."
                  : EMPTY_TEXT[status]
            }
          />
        ) : (
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
            <ReviewListPanel
              items={items}
              selectedId={selectedId}
              showStatus={status === "ALL"}
              unsaved={unsaved}
              page={page}
              totalPages={data?.totalPages ?? 0}
              fetching={list.isFetching}
              desktop={desktop}
              onSelect={setSelectedId}
              onPage={changePage}
            />
            {desktop && <ReviewPane {...paneProps} />}
          </div>
        )}
      </QueryState>

      {!desktop && <ReviewPane {...paneProps} />}

      {renderOrderDrawer(openOrderId, () => setOpenOrderId(null))}
    </div>
  );
}
