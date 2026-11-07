"use client";

import { Button } from "@shop/ui/admin-button";
import { shownLabel } from "../../model/table";

/** «Показать ещё 30» вместо пейджера: без общего числа от сервера пишем «Показано N», кнопка уходит на неполной порции. */
export function UsersLoadMore({
  count,
  hasMore,
  loading,
  onMore,
}: {
  count: number;
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 border-t border-[var(--line)] p-4">
      {hasMore && (
        <Button variant="surface" loading={loading} onClick={onMore} className="w-full sm:w-auto">
          Показать ещё 30
        </Button>
      )}
      <span className="tabular text-[11.5px] text-[var(--text-faint)]">{shownLabel(count, hasMore)}</span>
    </div>
  );
}
