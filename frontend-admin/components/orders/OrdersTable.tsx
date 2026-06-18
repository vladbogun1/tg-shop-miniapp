"use client";

/**
 * OrdersTable — table view (GET /api/admin/orders → PLAIN OrderCardDto[]).
 * The backend returns a plain array (not a paged wrapper), so paging is a
 * simple Next/Prev driven by page/size: if the returned array length < size,
 * we are on the last page and Next is disabled. Respects q + range + status.
 * On mobile it collapses to cards (§8bis.2).
 */
import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  ExternalLink,
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
  STATUS_VAR,
  STATUS_ORDER,
  DELIVERY_LABEL,
  shortId,
  formatDateTime,
} from "@/lib/orders";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { OrderCard } from "./OrderCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassChip } from "@/components/ui/GlassChip";

interface Props {
  search: string;
  range: TimeRange;
  onOpen: (id: string) => void;
}

const SIZE = 20;

export function OrdersTable({ search, range, onOpen }: Props) {
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<OrderStatus | "">("");
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
        status: status || undefined,
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
      <div className="mb-4 flex flex-wrap gap-2">
        <GlassChip active={status === ""} onClick={() => setStatus("")}>
          Все
        </GlassChip>
        {STATUS_ORDER.map((s) => (
          <GlassChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {STATUS_LABEL[s]}
          </GlassChip>
        ))}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-2.5 sm:hidden">
            {rows.length === 0 ? (
              <div className="glass rounded-[var(--r-lg)] px-4 py-10 text-center text-[var(--text-faint)]">
                Заказы не найдены
              </div>
            ) : (
              rows.map((o) => (
                <OrderCard key={o.id} order={o} onClick={() => onOpen(o.id)} />
              ))
            )}
          </div>

          {/* Desktop table */}
          <div
            className={`glass thin-scroll hidden overflow-x-auto rounded-[var(--r-lg)] transition-opacity sm:block ${
              isFetching ? "opacity-70" : ""
            }`}
          >
            <table className="w-full min-w-[860px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-white/10 text-left text-[var(--text-muted)]">
                  <SortHeader
                    col="createdAt"
                    label="Дата"
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                  <th className="px-4 py-3 font-medium">Заказ</th>
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
                  <th className="px-4 py-3 font-medium">Доставка</th>
                  <th className="px-4 py-3 font-medium">Оплата</th>
                  <th className="px-4 py-3 text-center font-medium">Чат</th>
                  <th className="px-4 py-3 text-right font-medium">Действие</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => onOpen(o.id)}
                    className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-faint)]">
                      {formatDateTime(o.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--text-muted)]">
                      {shortId(o.id)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text)]">
                      {o.customerName || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--text)]">
                      {money(o.totalMinor, o.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={STATUS_VAR[o.status]}>
                        {STATUS_LABEL[o.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {DELIVERY_LABEL[o.deliveryMethod]}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {o.paymentOptionTitle || "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {o.unreadCount > 0 ? (
                        <Badge
                          color="var(--danger)"
                          icon={<MessageCircle className="h-3 w-3" />}
                        >
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
                        className="inline-flex items-center gap-1 rounded-[var(--r-pill)] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-white/10"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-[var(--text-faint)]"
                    >
                      Заказы не найдены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(page > 0 || hasNext) && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <GlassButton
                size="sm"
                variant="glass"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                icon={<ChevronLeft className="h-4 w-4" />}
              />
              <span className="text-[13px] text-[var(--text-muted)]">
                Стр. {page + 1}
              </span>
              <GlassButton
                size="sm"
                variant="glass"
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
    <th
      className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--text)] ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-[var(--accent)]" : ""}`}
      >
        {label}
        <span className="text-[10px] leading-none">
          {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
}
