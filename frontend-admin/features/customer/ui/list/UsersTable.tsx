"use client";

import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import type { UserCardDto } from "../../model/types";
import { UsersDesktopTable } from "./UsersDesktopTable";
import { UsersMobileCards } from "./UsersMobileCards";
import { UsersPager } from "./UsersPager";
import { UsersToolbar } from "./UsersToolbar";
import { useUsersTableState } from "./use-users-table";

export function UsersTable({ onOpenUser }: { onOpenUser: (u: UserCardDto) => void }) {
  const t = useUsersTableState();
  const { data, isLoading, isFetching, isError, error, refetch } = t.query;

  return (
    <div className="panel overflow-hidden">
      <UsersToolbar
        search={t.search}
        onSearch={t.setSearch}
        blockedOnly={t.blockedOnly}
        onToggleBlocked={t.toggleBlockedOnly}
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
          <EmptyState icon={Inbox} title="Ничего не найдено" description="Попробуйте изменить запрос или сбросить фильтр." />
        </div>
      )}

      <UsersPager page={t.page} fetching={isFetching} hasNext={t.hasNext} onPage={t.setPage} />
    </div>
  );
}
