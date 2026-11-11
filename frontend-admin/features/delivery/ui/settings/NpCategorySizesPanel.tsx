"use client";

/**
 * «Размеры по категориям»: вес одного товара и его коробка для товаров категории без своих цифр.
 * Товар без своих берёт категории, категория — родителя, остальное — общие из «Новой Почты».
 */
import { Boxes } from "lucide-react";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { QueryState } from "@/components/ui/QueryState";
import { categoryDepth } from "../../model/size-form";
import { useCategorySizesQuery } from "../../queries";
import { CategorySizeFields } from "../size/CategorySizeFields";

export function NpCategorySizesPanel({ title }: { title: string }) {
  const q = useCategorySizesQuery();
  const rows = q.data ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  return (
    <div className="min-w-0">
      <PanelHeader
        icon={Boxes}
        title={title}
        description="Вес одного товара в граммах и размеры в сантиметрах — для товаров категории без своих цифр. Стороны в любом порядке: при подборе коробки товар поворачивается. Пусто — как у родительской категории или общие."
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
        {rows.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">Категорий пока нет.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2.5">
            {rows.map((c) => (
              <li
                key={c.id}
                className="card-2 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2 rounded-[var(--r-md)] px-3 py-2.5"
                style={{ marginLeft: Math.min(categoryDepth(c, byId), 3) * 12 }}
              >
                <div className="min-w-0 flex-1 basis-40 self-center break-words text-[13px] font-semibold text-[var(--text)]">{c.name}</div>
                <CategorySizeFields key={JSON.stringify(c.size)} id={c.id} name={c.name} size={c.size} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
