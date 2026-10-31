"use client";

import { PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function OrdersTableEmpty({ archived }: { archived: boolean }) {
  return (
    <EmptyState
      icon={PackageSearch}
      title={archived ? "В архиве пусто" : "Заказы не найдены"}
      description={archived ? "Архивные заказы появятся здесь." : "Попробуйте изменить фильтры или поисковый запрос."}
    />
  );
}
