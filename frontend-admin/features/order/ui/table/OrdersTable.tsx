"use client";

/**
 * OrdersTable — table view (GET /api/admin/orders → PLAIN OrderCardDto[]).
 * The backend returns a plain array (not a paged wrapper), so paging is a
 * simple Next/Prev driven by page/size: if the returned array length < size,
 * we are on the last page and Next is disabled. Respects q + period + status.
 * On mobile it collapses to cards.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { riseItem, staggerContainer } from "@/lib/motion";
import type { OrdersPeriod } from "../../model/period";
import { nextSort, STATUS_FILTER_OPTIONS, TABLE_SIZE, type SortState, type StatusFilter } from "../../model/table";
import { useOrdersTableQuery } from "../../queries/table";
import { OrderCard } from "../board/OrderCard";
import { OrdersTableDesktop } from "./OrdersTableDesktop";
import { OrdersTableEmpty } from "./OrdersTableEmpty";

interface Props {
  search: string;
  period: OrdersPeriod;
  onOpen: (id: string) => void;
}

function Pager({ page, hasNext, onPage }: { page: number; hasNext: boolean; onPage: (p: number) => void }) {
  if (page === 0 && !hasNext) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button size="icon" variant="surface" disabled={page === 0} onClick={() => onPage(Math.max(0, page - 1))} icon={<ChevronLeft className="h-4 w-4" />} />
      <span className="tabular min-w-12 text-center text-[13px] text-[var(--text-muted)]">Стр. {page + 1}</span>
      <Button size="icon" variant="surface" disabled={!hasNext} onClick={() => onPage(page + 1)} icon={<ChevronRight className="h-4 w-4" />} />
    </div>
  );
}

export function OrdersTable({ search, period, onOpen }: Props) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  // Archive: everyone may look, only the main admin changes (inside the order card).
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<SortState>({ sortBy: "createdAt", sortDir: "desc" });

  // reset to first page whenever filters/sort change
  useEffect(() => {
    setPage(0);
  }, [search, period, status, sort, archived]);

  const { data, isLoading, isFetching, isError, error, refetch } = useOrdersTableQuery({ search, period, status, page, archived, ...sort });
  const rows = data ?? [];
  const hasNext = rows.length >= TABLE_SIZE;

  return (
    <div>
      {/* Status filter */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="thin-scroll min-w-0 max-w-full overflow-x-auto pb-1">
          <SegmentedControl options={STATUS_FILTER_OPTIONS} value={status} onChange={setStatus} />
        </div>
        <button
          type="button"
          aria-pressed={archived}
          onClick={() => setArchived((v) => !v)}
          className={cn(
            "nb-press font-display inline-flex h-10 items-center gap-1.5 rounded-[var(--r-md)] border px-3 text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors",
            archived
              ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
              : "border-[var(--line)] bg-[var(--bg-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
          )}
        >
          <Archive className="h-3.5 w-3.5" />
          Архив
        </button>
      </div>

      {isError && !data ? (
        // A failed load is not «Заказы не найдены».
        <QueryState isLoading={false} isError error={error} refetch={refetch}>
          {null}
        </QueryState>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-[minmax(0,1fr)] gap-2.5 sm:hidden">
            {rows.length === 0 ? (
              <OrdersTableEmpty archived={archived} />
            ) : (
              rows.map((o) => (
                <motion.div key={o.id} variants={riseItem}>
                  <OrderCard order={o} onClick={() => onOpen(o.id)} />
                </motion.div>
              ))
            )}
          </motion.div>

          <OrdersTableDesktop
            rows={rows}
            archived={archived}
            fetching={isFetching}
            sortBy={sort.sortBy}
            sortDir={sort.sortDir}
            onSort={(col) => setSort((s) => nextSort(s, col))}
            onOpen={onOpen}
          />
          <Pager page={page} hasNext={hasNext} onPage={setPage} />
        </>
      )}
    </div>
  );
}
