"use client";

/** Шапка колонок таблицы (от 1024 px): клик по «Название», «Цена», «Остаток», «Продано» сортирует, повторный — в обратную сторону. */
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SortKey } from "../../model/list";
import { Check } from "./Check";
import { ROW_GRID } from "./row-grid";

/** Клик по колонке: какая сортировка включится (и в какую сторону, если эта уже выбрана). */
export function nextSort(col: "title" | "price" | "stock" | "sold", current: SortKey): SortKey {
  if (col === "title") return "title";
  if (col === "sold") return "sold";
  if (col === "price") return current === "price_desc" ? "price_asc" : "price_desc";
  return current === "stock_asc" ? "stock_desc" : "stock_asc";
}

interface HeadProps {
  children: string;
  active?: boolean;
  dir?: "up" | "down";
  onClick?: () => void;
  className?: string;
  /** Only from 1536 px. Its own flag: «hidden» next to «inline-flex» in one class list loses to it in the built CSS. */
  wideOnly?: boolean;
}

function Head({ children, active, dir, onClick, className, wideOnly }: HeadProps) {
  const body = (
    <>
      {children}
      {active && (dir === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </>
  );
  const cls = cn("field-label items-center gap-1 !text-[10.5px]", wideOnly ? "hidden 2xl:inline-flex" : "inline-flex", active && "!text-[var(--accent-hi)]", className);
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "focusable rounded-[var(--r-sm)] hover:!text-[var(--text)]")} title="Сортировать">
      {body}
    </button>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export function ProductsHeaderRow({
  sort,
  setSort,
  allSelected,
  someSelected,
  onToggleAll,
  selectable,
  count,
}: {
  sort: SortKey;
  setSort: (s: SortKey) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (on: boolean) => void;
  /** В архиве выбирать нечего. */
  selectable: boolean;
  count: number;
}) {
  return (
    <div
      className={cn(
        "sticky top-[calc(var(--hdr-h,61px)+var(--products-strip-h,0px))] z-10 hidden items-center gap-x-3 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-2 lg:grid",
        ROW_GRID
      )}
    >
      <span className="grid place-items-center">
        {selectable && (
          <span ref={(el) => {
            const input = el?.querySelector("input");
            if (input) input.indeterminate = someSelected && !allSelected;
          }}>
            <Check checked={allSelected} onChange={onToggleAll} label="Выбрать все в списке" />
          </span>
        )}
      </span>
      <span className="field-label !text-[10.5px]">{count}</span>
      <Head active={sort === "title"} dir="up" onClick={() => setSort(nextSort("title", sort))}>
        Название
      </Head>
      <Head wideOnly>Категория</Head>
      <Head wideOnly>Бренд</Head>
      <Head wideOnly active={sort === "sold"} dir="down" onClick={() => setSort(nextSort("sold", sort))}>
        Продано
      </Head>
      <Head wideOnly>Карточка</Head>
      <Head className="justify-self-end" active={sort === "price_asc" || sort === "price_desc"} dir={sort === "price_asc" ? "up" : "down"} onClick={() => setSort(nextSort("price", sort))}>
        Цена
      </Head>
      <Head className="justify-self-end" active={sort === "stock_asc" || sort === "stock_desc"} dir={sort === "stock_asc" ? "up" : "down"} onClick={() => setSort(nextSort("stock", sort))}>
        Остаток
      </Head>
      <Head className="justify-self-center">Витрина</Head>
      <span />
    </div>
  );
}
