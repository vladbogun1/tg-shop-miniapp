"use client";

/**
 * OrdersTable — table view (GET /api/admin/orders → PLAIN OrderCardDto[]).
 * The backend returns a plain array (not a paged wrapper), so paging is a
 * simple Next/Prev driven by page/size: if the returned array length < size,
 * we are on the last page and Next is disabled. Respects q + range + status.
 * On mobile it collapses to cards.
 */
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  ExternalLink,
  PackageSearch,
} from "lucide-react";
import {
  adminApi,
  type OrderCardDto,
  type OrderSortBy,
  type OrderStatus,
  type SortDir,
  type TimeRange,
} from "@/lib/api";
import { money } from "@/lib/money";
import {
  STATUS_LABEL,
  STATUS_ORDER,
  DELIVERY_LABEL,
  shortId,
  formatDateTime,
} from "@/lib/orders";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { staggerContainer, riseItem } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { OrderCard } from "./OrderCard";

interface Props {
  search: string;
  range: TimeRange;
  onOpen: (id: string) => void;
}

const SIZE = 20;

type StatusFilter = OrderStatus | "ALL";

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "Все" },
  ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

export function OrdersTable({ search, range, onOpen }: Props) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [sortBy, setSortBy] = useState<OrderSortBy>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // reset to first page whenever filters/sort change
  useEffect(() => {
    setPage(0);
  }, [search, range, status, sortBy, sortDir]);

  // Toggle direction when re-clicking the active column, otherwise switch
  // column and default to descending.
  function toggleSort(col: OrderSortBy) {
    if (col === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["orders-table", search, range, status, page, sortBy, sortDir],
    queryFn: () =>
      adminApi.orders({
        q: search || undefined,
        range,
        status: status === "ALL" ? undefined : status,
        page,
        size: SIZE,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  const rows: OrderCardDto[] = data ?? [];
  const hasNext = rows.length >= SIZE;

  return (
    <div>
      {/* Status filter */}
      <div className="thin-scroll mb-4 overflow-x-auto pb-1">
        <SegmentedControl
          options={STATUS_FILTER_OPTIONS}
          value={status}
          onChange={setStatus}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid gap-2.5 sm:hidden"
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="Заказы не найдены"
                description="Попробуйте изменить фильтры или поисковый запрос."
              />
            ) : (
              rows.map((o) => (
                <motion.div key={o.id} variants={riseItem}>
                  <OrderCard order={o} onClick={() => onOpen(o.id)} />
                </motion.div>
              ))
            )}
          </motion.div>

          {/* Desktop table */}
          <div
            className={cn(
              "card thin-scroll hidden overflow-x-auto p-0 transition-opacity sm:block",
              isFetching && "opacity-70"
            )}
          >
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
                <tr className="border-b-[3px] border-[var(--line)] text-left text-[11px] font-black uppercase tracking-wide text-[var(--text-muted)]">
                  <SortHeader
                    col="createdAt"
                    label="Дата"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3">Заказ</th>
                  <SortHeader
                    col="customerName"
                    label="Клиент"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    col="totalMinor"
                    label="Сумма"
                    align="right"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <SortHeader
                    col="status"
                    label="Статус"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3">Доставка</th>
                  <th className="px-4 py-3">Оплата</th>
                  <th className="px-4 py-3 text-center">Чат</th>
                  <th className="px-4 py-3 text-right">Действие</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => onOpen(o.id)}
                    className="cursor-pointer border-b-2 border-[var(--border-2)] transition-colors last:border-0 hover:bg-[var(--surface-2)]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-faint)]">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-[var(--text-muted)]">
                      {shortId(o.id)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--text)]">
                      {o.customerName || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-[var(--text)]">
                      {money(o.totalMinor, o.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {DELIVERY_LABEL[o.deliveryMethod]}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {o.paymentOptionTitle || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {o.unreadCount > 0 ? (
                        <Badge tone="danger">
                          <MessageCircle className="h-3 w-3" />
                          {o.unreadCount}
                        </Badge>
                      ) : (
                        <span className="text-[var(--text-faint)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(o.id);
                        }}
                        className="nb-press inline-flex items-center gap-1 rounded-[var(--r-sm)] border-2 border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[12px] font-black uppercase tracking-wide text-[var(--text)] shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-hover)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12">
                      <EmptyState
                        icon={PackageSearch}
                        title="Заказы не найдены"
                        description="Попробуйте изменить фильтры или поисковый запрос."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(page > 0 || hasNext) && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                size="icon"
                variant="surface"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                icon={<ChevronLeft className="h-4 w-4" />}
              />
              <span className="text-[13px] text-[var(--text-muted)]">
                Стр. {page + 1}
              </span>
              <Button
                size="icon"
                variant="surface"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
                icon={<ChevronRight className="h-4 w-4" />}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Clickable table header that sorts by `col` and shows a ↑/↓ when active. */
function SortHeader({
  col,
  label,
  align = "left",
  sortBy,
  sortDir,
  onSort,
}: {
  col: OrderSortBy;
  label: string;
  align?: "left" | "right";
  sortBy: OrderSortBy;
  sortDir: SortDir;
  onSort: (col: OrderSortBy) => void;
}) {
  const active = sortBy === col;
  return (
    <th className={cn("px-4 py-3", align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-[var(--text)]",
          align === "right" && "flex-row-reverse",
          active && "text-[var(--accent)]"
        )}
      >
        {label}
        <span className="text-[10px] leading-none">
          {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
}
