"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@shop/ui/admin-button";

export function ReviewsPager({
  page,
  totalPages,
  fetching,
  onPage,
}: {
  page: number;
  totalPages: number;
  fetching: boolean;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <span className="field-label tabular mr-1 !text-[11px] !text-[var(--text-faint)]">
        Стр. {page + 1} из {totalPages}
        {fetching ? " · …" : ""}
      </span>
      <Button
        variant="surface"
        size="icon"
        disabled={page === 0}
        onClick={() => onPage(Math.max(0, page - 1))}
        icon={<ChevronLeft className="h-4 w-4" />}
        aria-label="Назад"
      />
      <Button
        variant="surface"
        size="icon"
        disabled={page + 1 >= totalPages}
        onClick={() => onPage(page + 1)}
        icon={<ChevronRight className="h-4 w-4" />}
        aria-label="Вперёд"
      />
    </div>
  );
}
