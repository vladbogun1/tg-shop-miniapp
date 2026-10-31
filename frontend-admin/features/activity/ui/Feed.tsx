"use client";

import { useMemo } from "react";
import { Bot } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { typeOptions } from "../model/filter";
import { useActivityFacets, useActivityFeed } from "../queries";
import { EventList } from "./EventList";
import { FeedFilters } from "./FeedFilters";
import { useFeedFilters, type FeedShared } from "./use-feed-filters";
import type { RowActions } from "./use-row-actions";

/** Вкладка «Лента событий»: фильтры, итоги по фильтру, страницы событий. */
export function Feed({ shared, actions }: { shared: FeedShared; actions: RowActions }) {
  const f = useFeedFilters(shared);
  const facetsQ = useActivityFacets();
  const logQ = useActivityFeed(f.filter);
  const rows = useMemo(() => logQ.data?.pages.flatMap((p) => p.items) ?? [], [logQ.data]);
  const totals = logQ.data?.pages[0]?.totals ?? null;
  const typeOpts = useMemo(() => typeOptions(facetsQ.data, shared.source), [facetsQ.data, shared.source]);

  return (
    <>
      <FeedFilters
        shared={shared}
        fields={f.fields}
        setField={f.setField}
        facets={facetsQ.data}
        typeOptions={typeOpts}
        filtered={f.filtered}
        onReset={f.reset}
      />

      {totals && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <span className="field-label !text-[var(--text-faint)]">По фильтру:</span>
          <Badge tone="ok">успешно {totals.OK ?? 0}</Badge>
          <Badge tone="danger">ошибок {totals.FAILED ?? 0}</Badge>
          <Badge tone="warn">пропущено {totals.SKIPPED ?? 0}</Badge>
        </div>
      )}

      <QueryState
        isLoading={logQ.isLoading}
        isError={logQ.isError}
        error={logQ.error}
        refetch={() => logQ.refetch()}
        loadingLabel="Загружаем события"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Bot}
            title={f.filtered ? "Ничего не найдено" : "Событий пока нет"}
            description={
              f.filtered
                ? "Измените фильтры или период."
                : "Здесь появятся сообщения бота, заказы и оплаты с сайта и из Mini App."
            }
          />
        ) : (
          <>
            <EventList rows={rows} actions={actions} />
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="field-label tabular !text-[var(--text-faint)]">
                Показано: {rows.length}
                {facetsQ.data ? ` · хранится ${facetsQ.data.retentionDays} дн.` : ""}
              </span>
              {logQ.hasNextPage && (
                <Button variant="surface" loading={logQ.isFetchingNextPage} onClick={() => logQ.fetchNextPage()}>
                  Ещё
                </Button>
              )}
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}
