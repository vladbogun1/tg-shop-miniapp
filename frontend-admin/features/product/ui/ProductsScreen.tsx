"use client";

/**
 * Товары (маршрут "/products").
 *
 *  - одна липкая полоса: поиск, «Фильтры (N)», вид, чипы статусов с числами, панель выбора;
 *  - сводка склада одной строкой («закончились» включает чип «Закончились»);
 *  - список (по умолчанию) ⇄ карточки; строка целиком открывает редактор; цена и остаток правятся на месте;
 *  - отмеченные строки: показать / скрыть / в архив (показ — через шлюз публикации, отказы собираются в отчёт);
 *  - `unfinished` = «Незавершён» (создан короткой формой): «Оформить с ИИ» открывает CardCompletionModal;
 *  - красная подсветка и бейдж «Закончился» у активных с остатком 0; остаток = сумма вариантов, иначе остаток товара.
 */
import { PackageSearch, Plus } from "lucide-react";
import { useRef } from "react";
import { Button } from "@shop/ui/admin-button";
import { CardCompletionModal } from "@/features/cards";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { useCssVarHeight } from "@/lib/use-css-var-height";
import { money } from "@/lib/money";
import { ProductModal } from "./modal/ProductModal";
import { BulkPublishReport } from "./list/BulkPublishReport";
import { ProductCard } from "./list/ProductCard";
import { ProductRow, type RowProps } from "./list/ProductRow";
import { ProductsBulkBar } from "./list/ProductsBulkBar";
import { ProductsHeaderRow } from "./list/ProductsHeaderRow";
import { ProductsToolbar } from "./list/ProductsToolbar";
import { useProductsScreen, type ProductsScreenState } from "./list/use-products-screen";

/** Склад одной строкой; «закончились» — кнопка, включающая соответствующий чип. */
function Summary({ s }: { s: ProductsScreenState }) {
  const { count, units, valueMinor, out } = s.stockSummary;
  return (
    <p className="tabular mb-2 text-[12.5px] text-[var(--text-muted)]">
      {count} товаров · {units} шт · {money(valueMinor)}
      {out > 0 && (
        <>
          {" · "}
          <button
            type="button"
            onClick={() => s.setStatus("out")}
            className="focusable rounded-[var(--r-sm)] font-semibold text-[var(--danger-ink)] underline-offset-2 hover:underline"
            title="Показать только закончившиеся"
          >
            закончились {out}
          </button>
        </>
      )}
    </p>
  );
}

function ListBody({ s, rowProps }: { s: ProductsScreenState; rowProps: (p: Item) => RowProps }) {
  const { visible, archivedView, selected } = s;
  if (s.view === "cards") {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((p) => (
          <ProductCard key={p.id} {...rowProps(p)} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 lg:gap-2.5">
      <ProductsHeaderRow
        sort={s.sort}
        setSort={s.setSort}
        allSelected={visible.length > 0 && selected.size >= visible.length && visible.every((p) => selected.has(p.id))}
        someSelected={selected.size > 0}
        onToggleAll={s.selectAll}
        selectable={!archivedView}
        count={visible.length}
      />
      {visible.map((p) => (
        <ProductRow key={p.id} {...rowProps(p)} />
      ))}
    </div>
  );
}

type Item = ProductsScreenState["visible"][number];

/** Всё, что строка и плитка берут от экрана (выбор, правка на месте, действия). */
function rowPropsOf(s: ProductsScreenState): (p: Item) => RowProps {
  const selecting = s.selectMode || s.selected.size > 0;
  return (p) => ({
    p,
    missing: s.missingOf.get(p.id) ?? 0,
    categoryName: (p.categoryId && s.categoryNames.get(p.categoryId)) || "",
    archivedView: s.archivedView,
    selected: s.selected.has(p.id),
    selecting,
    onSelect: (on) => s.toggleSelected(p.id, on),
    onComplete: () => s.setCompletion({ id: p.id, reason: "manual" }),
    onEdit: () => s.openEditor(p),
    onActive: (v) => s.setActive(p, v),
    onArchive: (a) => s.setArchived(p, a),
    savePrice: (raw) => s.quick.savePrice(p, raw),
    saveStock: (raw) => s.quick.saveStock(p, raw),
  });
}

export function ProductsScreen() {
  const s = useProductsScreen();
  const { archivedView, isLoading, visible, products } = s;
  const strip = useRef<HTMLDivElement>(null);
  useCssVarHeight(strip, "--products-strip-h");
  const rowProps = rowPropsOf(s);
  const newButton = (
    <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => s.openEditor(null)}>
      Новый товар
    </Button>
  );
  return (
    <div>
      <PageHeader
        title="Товары"
        subtitle="Каталог, остатки и видимость"
        actions={
          <>
            {!archivedView && (
              <Button variant={s.selectMode ? "surface" : "outline"} className="lg:hidden" onClick={() => (s.selectMode ? s.clearSelection() : s.setSelectMode(true))}>
                {s.selectMode ? "Готово" : "Выбрать"}
              </Button>
            )}
            <SegmentedControl<"active" | "archived">
              className="h-10 pointer-coarse:h-11"
              options={[
                { value: "active", label: "Активные" },
                { value: "archived", label: "Архив" },
              ]}
              value={archivedView ? "archived" : "active"}
              onChange={(v) => s.setArchivedView(v === "archived")}
            />
            {newButton}
          </>
        }
      />

      {!archivedView && <Summary s={s} />}

      <div ref={strip} className={cn("sticky top-[var(--hdr-h,61px)] z-20 -mx-4 mb-2 bg-[var(--bg)] px-4 pb-2 pt-1 lg:-mx-7 lg:px-7")}>
        <ProductsToolbar s={s} />
        <ProductsBulkBar count={s.selectedList.length} busy={s.bulk.busy} onShow={s.bulk.show} onHide={s.bulk.hide} onArchive={s.bulk.archive} onClear={s.clearSelection} />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={products.length === 0 ? (archivedView ? "Архив пуст" : "Товаров пока нет") : "Ничего не найдено"}
          description={
            products.length === 0
              ? archivedView
                ? "Архивированные товары появятся здесь."
                : "Создайте первый товар, чтобы начать."
              : "Попробуйте изменить поиск или фильтры."
          }
          action={products.length === 0 && !archivedView ? newButton : undefined}
        />
      ) : (
        <ListBody s={s} rowProps={rowProps} />
      )}

      <ProductModal
        open={s.modalOpen}
        product={s.editing}
        onClose={s.closeEditor}
        initialStep={s.editStep}
        onSaved={s.refresh}
        onCreated={(p) => s.setCompletion({ id: p.id, reason: "created" })}
        onCompleteWithAi={(id) => s.setCompletion({ id, reason: "manual" })}
      />
      {s.completion && (
        <CardCompletionModal
          key={s.completion.id}
          productId={s.completion.id}
          open
          reason={s.completion.reason}
          onClose={() => {
            s.setCompletion(null);
            s.refresh();
          }}
        />
      )}
      <BulkPublishReport report={s.bulk.report} busy={s.bulk.busy} onForce={s.bulk.forceShow} onClose={s.bulk.closeReport} />
      {s.quick.quickEditUi}
      {s.gateUi}
    </div>
  );
}
