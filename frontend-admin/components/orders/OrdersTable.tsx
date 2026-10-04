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
import { PaymentBadge } from "@/components/orders/PaymentBadge";
import { SourceBadge } from "@/components/orders/SourceBadge";
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
            <table className="data-table min-w-[860px] [&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4">
              <thead className="sticky top-0 z-10">
                <tr>
                  <SortHeader
                    col="createdAt"
                    label="Дата"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th>Заказ</th>
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
                  <th>Доставка</th>
                  <th>Оплата</th>
                  <th className="!text-center">Платёж</th>
                  <th className="!text-center">Чат</th>
                  <th className="r">Действие</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => onOpen(o.id)}
                    className="cursor-pointer"
                  >
                    <td className="tabular whitespace-nowrap !text-[var(--text-faint)]">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="font-display tabular whitespace-nowrap font-semibold tracking-[0.02em] !text-[var(--text-muted)]">
                      {shortId(o.id)}
                    </td>
                    <td className="font-semibold">
                      {/* The name never breaks; the «Сайт» chip drops under it when the column is tight. */}
                      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="whitespace-nowrap">{o.customerName || "—"}</span>
                        <SourceBadge source={o.source} />
                      </span>
                    </td>
                    <td className="r font-display whitespace-nowrap font-bold !text-[var(--ink)]">
                      {money(o.totalMinor, o.currency)}
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="whitespace-nowrap !text-[var(--text-muted)]">
                      {DELIVERY_LABEL[o.deliveryMethod]}
                    </td>
                    <td className="!text-[var(--text-muted)]">
                      {o.paymentOptionTitle || "—"}
                    </td>
                    <td className="text-center">
                      <PaymentBadge order={o} icon={false} />
                    </td>
                    <td className="text-center">
                      {o.unreadCount > 0 ? (
                        <Badge tone="danger">
                          <MessageCircle className="h-3 w-3" />
                          {o.unreadCount}
                        </Badge>
                      ) : (
                        <span className="text-[var(--text-faint)]">—</span>
                      )}
                    </td>
                    <td className="r">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(o.id);
                        }}
                        className="nb-press font-display inline-flex h-7 items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] px-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="!px-4 !py-12">
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
              <span className="tabular min-w-12 text-center text-[13px] text-[var(--text-muted)]">
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
    // aria-sort is a property of the column header, not of the button inside it.
    <th
      className={cn(align === "right" && "r")}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          // Preflight resets text-transform on <button>: re-inherit the header's caps/tracking.
          "inline-flex items-baseline gap-1 uppercase tracking-[inherit] transition-colors hover:text-[var(--text)]",
          align === "right" && "flex-row-reverse",
          active && "text-[var(--accent-hi)]"
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
