"use client";

import { LifeBuoy, PenSquare, RotateCw, Search, X } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl, type SegOption } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import { EMPTY_HINT } from "../model/thread";
import type { SupportFilter, SupportThread } from "../model/types";
import { ThreadRow } from "./ThreadRow";

/**
 * Очередь: поиск (пока строка не пуста, экран ищет по всем статусам — это решает SupportScreen),
 * сегменты «Ждут ответа / Открытые / Закрытые / Все», «Написать клиенту», ручное «Обновить».
 */
export function SupportList({
  list,
  threads,
  options,
  filter,
  onFilter,
  search,
  onSearch,
  q,
  openId,
  nowMs,
  onOpen,
  onCompose,
  scrollClass,
}: {
  list: UseQueryResult<SupportThread[]>;
  threads: SupportThread[];
  options: SegOption<SupportFilter>[];
  filter: SupportFilter;
  onFilter: (f: SupportFilter) => void;
  search: string;
  onSearch: (v: string) => void;
  /** Поисковая строка после задержки (пусто — поиска нет). */
  q: string;
  openId: string | null;
  nowMs: number;
  onOpen: (id: string) => void;
  onCompose: () => void;
  scrollClass?: string;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="mb-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Клиент или товар"
              aria-label="Поиск по вопросам"
              icon={<Search className="h-4 w-4" />}
              rightSlot={
                search ? (
                  <button
                    type="button"
                    onClick={() => onSearch("")}
                    aria-label="Очистить поиск"
                    className="grid h-8 w-8 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--text)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : undefined
              }
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Обновить"
            title="Обновить (список сам обновляется каждые 15 секунд)"
            icon={<RotateCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />}
            onClick={() => list.refetch()}
          />
          {/* A labelled action (an orange square with no word read as an unknown alert); a phone keeps just the icon. */}
          <Button variant="accent" compactBelow="sm" aria-label="Написать клиенту" title="Написать клиенту" icon={<PenSquare className="h-4 w-4" />} onClick={onCompose}>
            Написать
          </Button>
        </div>
        <SegmentedControl options={options} value={filter} onChange={onFilter} size="sm" />
      </div>

      <div className={cn("min-h-0", scrollClass)}>
        <QueryState
          isLoading={list.isLoading}
          isError={list.isError && !list.data}
          error={list.error}
          refetch={list.refetch}
          loadingLabel="Загружаем вопросы"
        >
          {threads.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title={q ? "Ничего не нашлось" : "Вопросов нет"}
              description={q ? "Ищется по имени клиента и названию товара — попробуйте другое." : EMPTY_HINT[filter]}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {threads.map((t, i) => (
                <ThreadRow key={t.id} thread={t} index={i} active={t.id === openId} nowMs={nowMs} onOpen={() => onOpen(t.id)} />
              ))}
            </ul>
          )}
        </QueryState>
      </div>
    </div>
  );
}
