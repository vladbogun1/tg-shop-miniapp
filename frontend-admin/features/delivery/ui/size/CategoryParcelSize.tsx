"use client";

/** Вкладка «Посылка» окна категории: вес и коробка товара категории для Новой Почты, сохраняется сразу. */
import { QueryState } from "@/components/ui/QueryState";
import { useCategorySizesQuery } from "../../queries";
import { CategorySizeFields } from "./CategorySizeFields";

export function CategoryParcelSize({ categoryId }: { categoryId: string }) {
  const q = useCategorySizesQuery();
  const row = q.data?.find((c) => c.id === categoryId);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-[12.5px] leading-snug text-[var(--text-muted)]">
        Вес одного товара в граммах и его размеры в сантиметрах — для товаров категории без своих цифр. Пусто — как у родительской
        категории или общие из настроек «Новая Почта». Стороны в любом порядке.
      </p>
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        {row ? (
          <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2">
            <CategorySizeFields key={JSON.stringify(row.size)} id={row.id} name={row.name} size={row.size} />
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-muted)]">Категория ещё не появилась в списке размеров — откройте окно позже.</p>
        )}
      </QueryState>
    </div>
  );
}
