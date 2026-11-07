"use client";

import { Inbox } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { hasFilters } from "../../model/filters";
import type { UserCardDto } from "../../model/types";
import { UsersDesktopTable } from "./UsersDesktopTable";
import { UsersLoadMore } from "./UsersLoadMore";
import { UsersMobileCards } from "./UsersMobileCards";
import { UsersToolbar } from "./UsersToolbar";
import { useUsersTableState } from "./use-users-table";

export function UsersTable({ onOpenUser }: { onOpenUser: (u: UserCardDto) => void }) {
  const t = useUsersTableState();
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = t.query;
  const filtered = !!t.search || hasFilters(t.filters);

  return (
    <div className="panel">
      <UsersToolbar
        search={t.search}
        onSearch={t.setSearch}
        filters={t.filters}
        onFilters={t.setFilters}
        sorting={t.sorting}
        onSorting={t.setSorting}
      />

      {isError && !data ? (
        <div className="p-4">
          <QueryState isLoading={false} isError error={error} refetch={refetch}>
            {null}
          </QueryState>
        </div>
      ) : null}

      <UsersDesktopTable
        rows={t.rows}
        loading={isLoading}
        resetKey={t.resetKey}
        sortBy={t.sorting.sortBy}
        sortDir={t.sorting.sortDir}
        toggleSort={t.toggleSort}
        onOpenUser={onOpenUser}
      />
      <UsersMobileCards rows={isLoading ? [] : t.rows} resetKey={t.resetKey} onOpenUser={onOpenUser} />

      {!isLoading && !isError && t.rows.length === 0 && (
        <div className="p-6">
          <EmptyState
            icon={Inbox}
            title="Ничего не найдено"
            description="Попробуйте изменить запрос или сбросить фильтр."
            action={
              filtered ? (
                <Button variant="surface" size="sm" onClick={t.reset}>
                  Сбросить
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <UsersLoadMore
        count={t.rows.length}
        hasMore={!!hasNextPage}
        loading={isFetchingNextPage}
        onMore={() => void fetchNextPage()}
      />
    </div>
  );
}
