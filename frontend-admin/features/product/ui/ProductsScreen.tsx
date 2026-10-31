"use client";

/**
 * Товары (маршрут "/products").
 *
 *  - поиск по названию (и бренду), фильтры: категория (дерево, «Без категории»), бренд, статус карточки
 *    (Черновик / От ИИ / Проверена / Неполная), состояние; чипы статусов с числами
 *    (Все / В наличии / Закончились (видны) / Скрытые / Незавершённые),
 *  - `unfinished` = «Незавершён» (создан короткой формой, ещё не опубликован): «Оформить с ИИ» открывает
 *    CardCompletionModal; включение черновика идёт через шлюз публикации,
 *  - умная сортировка (активные без остатка — наверху) + ручные,
 *  - список (по умолчанию) ⇄ карточки; строка целиком открывает редактор,
 *  - остаток = сумма остатков вариантов, иначе остаток товара,
 *  - красная подсветка и бейдж «Закончился» у активных с остатком 0,
 *  - «на витрине» и архив — оба с тостом «Отменить»; на телефонах действия строки — в меню «⋯».
 */
import { motion } from "framer-motion";
import { PackageSearch, Plus } from "lucide-react";
import { Button } from "@shop/ui/admin-button";
import { CardCompletionModal } from "@/features/cards";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { money } from "@/lib/money";
import { staggerContainer } from "@/lib/motion";
import { ProductModal } from "./modal/ProductModal";
import { ProductCard } from "./list/ProductCard";
import { ProductFilters } from "./list/ProductFilters";
import { ProductRow } from "./list/ProductRow";
import { StatTile } from "./list/RowBits";
import { useProductsScreen } from "./list/use-products-screen";

export function ProductsScreen() {
  const s = useProductsScreen();
  const { archivedView, isLoading, visible, products, missingOf } = s;
  const rowProps = (p: (typeof visible)[number]) => ({
    p,
    missing: missingOf.get(p.id) ?? 0,
    onComplete: () => s.setCompletion({ id: p.id, reason: "manual" }),
    archivedView,
    onEdit: () => s.openEditor(p),
    onActive: (v: boolean) => s.setActive(p, v),
    onArchive: (a: boolean) => s.setArchived(p, a),
  });
  return (
    <div>
      <PageHeader
        title="Товары"
        subtitle="Каталог, остатки и видимость"
        actions={
          <>
            <SegmentedControl<"active" | "archived">
              className="h-10 pointer-coarse:h-11"
              options={[
                { value: "active", label: "Активные" },
                { value: "archived", label: "Архив" },
              ]}
              value={archivedView ? "archived" : "active"}
              onChange={(v) => s.setArchivedView(v === "archived")}
            />
            <Button
              variant="accent"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => s.openEditor(null)}
            >
              Новый товар
            </Button>
          </>
        }
      />

      {/* Warehouse summary */}
      {!archivedView && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Товаров" value={String(s.stockSummary.count)} />
          <StatTile label="На складе" value={`${s.stockSummary.units} шт`} />
          <StatTile label="Стоимость склада" value={money(s.stockSummary.valueMinor)} accent />
          <StatTile label="Закончились" value={String(s.stockSummary.out)} />
        </div>
      )}

      <ProductFilters {...s} />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[80px] rounded-[var(--r-md)]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={
            products.length === 0
              ? archivedView
                ? "Архив пуст"
                : "Товаров пока нет"
              : "Ничего не найдено"
          }
          description={
            products.length === 0
              ? archivedView
                ? "Архивированные товары появятся здесь."
                : "Создайте первый товар, чтобы начать."
              : "Попробуйте изменить поиск или фильтры."
          }
          action={
            products.length === 0 && !archivedView ? (
              <Button
                variant="accent"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => s.openEditor(null)}
              >
                Новый товар
              </Button>
            ) : undefined
          }
        />
      ) : s.view === "list" ? (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-3">
          {visible.map((p) => (
            <ProductRow key={p.id} {...rowProps(p)} />
          ))}
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {visible.map((p) => (
            <ProductCard key={p.id} {...rowProps(p)} />
          ))}
        </motion.div>
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
      {s.gateUi}
    </div>
  );
}
