"use client";

/**
 * Товары поставки, которые скрыты с витрины, хотя карточка уже оформлена (обычно — заведённые «Поставкой с ИИ»: она
 * создаёт товары скрытыми). Без напоминания о них легко забыть: покупатели их не видят и не могут заказать заранее.
 * Кнопка открывает «Товары» с ними выбранными — там обычное «Показать» с отчётом, кого не выложить и почему.
 */
import { Button } from "@shop/ui/admin-button";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useHiddenCards } from "@/features/cards";
import type { Batch } from "@/features/procurement";
import { productsSelectHref } from "@/features/product";

const SHOWN_TITLES = 3;

export function HiddenProductsBanner({ batch }: { batch: Batch }) {
  const router = useRouter();
  const ids = useHiddenCards(batch.items.map((i) => i.productId));
  if (!ids.length) return null;
  const titles = ids.map((id) => batch.items.find((i) => i.productId === id)?.title ?? "").filter(Boolean);
  const more = titles.length - SHOWN_TITLES;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Скрыты с витрины: {ids.length}</span>
        <span className="text-[var(--text-muted)]">
          {" "}— покупатели их не видят: {titles.slice(0, SHOWN_TITLES).join(", ")}
          {more > 0 ? ` и ещё ${more}` : ""}.
        </span>
      </p>
      <Button variant="outline" size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => router.push(productsSelectHref(ids))}>
        Выложить
      </Button>
    </div>
  );
}
