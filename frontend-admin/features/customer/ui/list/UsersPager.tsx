"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@shop/ui/admin-button";

export function UsersPager({
  page,
  fetching,
  hasNext,
  onPage,
}: {
  page: number;
  fetching: boolean;
  hasNext: boolean;
  onPage: (next: (p: number) => number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] p-4">
      <span className="field-label tabular mr-1 !text-[11px] !text-[var(--text-faint)]">
        Стр. {page + 1}
        {fetching ? " · …" : ""}
      </span>
      <Button
        variant="surface"
        size="icon"
        disabled={page === 0}
        onClick={() => onPage((p) => Math.max(0, p - 1))}
        icon={<ChevronLeft className="h-4 w-4" />}
        aria-label="Назад"
      />
      <Button
        variant="surface"
        size="icon"
        disabled={!hasNext}
        onClick={() => onPage((p) => p + 1)}
        icon={<ChevronRight className="h-4 w-4" />}
        aria-label="Вперёд"
      />
    </div>
  );
}
