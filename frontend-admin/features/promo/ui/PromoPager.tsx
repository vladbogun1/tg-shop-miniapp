"use client";

import { Button } from "@shop/ui/admin-button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  size: number;
  total: number;
  onPage: (page: number) => void;
}

/** «Стр. 2 из 5 · всего 214» и «назад / вперёд»; одна страница — ничего не рисует. */
export function PromoPager({ page, size, total, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Страницы" className="mt-3 flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" disabled={page <= 0} icon={<ChevronLeft className="h-4 w-4" />} onClick={() => onPage(page - 1)}>
        Назад
      </Button>
      <span className="tabular text-[12.5px] text-[var(--text-muted)]">
        Стр. {page + 1} из {pages} · всего {total}
      </span>
      <Button variant="ghost" size="sm" disabled={page + 1 >= pages} iconRight={<ChevronRight className="h-4 w-4" />} onClick={() => onPage(page + 1)}>
        Вперёд
      </Button>
    </nav>
  );
}
