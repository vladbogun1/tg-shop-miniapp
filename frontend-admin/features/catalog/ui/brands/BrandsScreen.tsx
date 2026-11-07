"use client";

/**
 * «Бренды» (route "/brands"): справочник производителей каталога v2 — название, slug, сайт, число товаров,
 * алиасы (другие написания, которые узнают ИИ-импорт и «Создать „…“»). Таблица с сортировкой по заголовкам,
 * чипы-фильтры («Без товаров», «Без логотипа», «Возможные дубликаты»), плашка дубликатов с «Объединить группу»,
 * массовые действия («Объединить в…», «Удалить пустые»), удаление одного бренда с подтверждением.
 * Логотип (и как он рисуется) идёт в бегущую строку брендов на главной сайта.
 */
import { BadgeCheck, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { activeGroups, dupeGroups, dupeIds, filterBrands, type BrandFilter } from "../../model/brand-dupes";
import { visibleBrands, type BrandSort } from "../../model/brands";
import type { AdminBrand } from "../../model/types";
import { plural, productsWord } from "../../model/words";
import { useBrandsQuery, useDeleteBrand, useDeleteBrands } from "../../queries";
import { BulkBar, FilterChip, StickyToolbar } from "../BulkBar";
import { BrandDupes } from "./BrandDupes";
import { BrandFormModal } from "./BrandFormModal";
import { BrandsList } from "./BrandsList";
import { MergeBrandModal } from "./MergeBrandModal";
import { useDismissedDupes } from "./use-dismissed-dupes";

export function BrandsScreen() {
  const confirm = useConfirm();
  const q = useBrandsQuery();
  const brands = useMemo(() => q.data ?? [], [q.data]);
  const deleteBrand = useDeleteBrand();
  const deleteBrands = useDeleteBrands();
  const { dismissed, dismiss } = useDismissedDupes();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: BrandSort; dir: 1 | -1 }>({ key: "products", dir: 1 });
  const [filters, setFilters] = useState<ReadonlySet<BrandFilter>>(new Set());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<AdminBrand | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [merging, setMerging] = useState<AdminBrand[] | null>(null);

  const groups = useMemo(() => activeGroups(dupeGroups(brands), dismissed), [brands, dismissed]);
  const dupes = useMemo(() => dupeIds(groups), [groups]);
  const emptyCount = useMemo(() => brands.filter((b) => b.productCount === 0).length, [brands]);
  const noLogoCount = useMemo(() => brands.filter((b) => !b.logoUrl).length, [brands]);
  const visible = useMemo(
    () => filterBrands(visibleBrands(brands, search, sort.key, sort.dir), filters, dupes),
    [brands, search, sort, filters, dupes]
  );
  const chosen = useMemo(() => brands.filter((b) => selected.has(b.id)), [brands, selected]);
  const chosenEmpty = chosen.filter((b) => b.productCount === 0);

  const toggleFilter = (f: BrandFilter) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  const onSort = (key: BrandSort) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const toggleOne = useCallback(
    (id: string, on: boolean) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    []
  );
  const toggleAll = (on: boolean) => setSelected(on ? new Set(visible.map((b) => b.id)) : new Set());

  function openForm(b: AdminBrand | null) {
    setEditing(b);
    setFormOpen(true);
  }

  async function remove(b: AdminBrand) {
    const ok = await confirm({
      title: `Удалить бренд «${b.name}»?`,
      message:
        b.productCount > 0
          ? `${productsWord(b.productCount)} останутся без бренда (фильтр по бренду и разметка для поиска их не увидят). Если это дубликат — лучше «Объединить».`
          : "Бренд без товаров — удаление ничего не затронет.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) deleteBrand.mutate(b.id, { onSuccess: () => toggleOne(b.id, false) });
  }

  async function removeEmpty() {
    const n = chosenEmpty.length;
    const skipped = chosen.length - n;
    const ok = await confirm({
      title: `Удалить ${n} ${plural(n, "бренд", "бренда", "брендов")} без товаров?`,
      message: `${chosenEmpty.map((b) => b.name).join(", ")}. Это необратимо.${skipped ? ` Бренды с товарами (${skipped}) не будут тронуты.` : ""}`,
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) deleteBrands.mutate(chosenEmpty.map((b) => b.id), { onSuccess: () => setSelected(new Set()) });
  }

  const newBrandButton = (
    <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
      Новый бренд
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Бренды"
        subtitle="Справочник производителей: фильтр на витрине, разметка для поиска, распознавание ИИ"
        actions={newBrandButton}
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка брендов…">
        {brands.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="Брендов пока нет"
            description="Добавьте бренд вручную или выберите «Создать „…“» в мастере товара — он появится здесь."
            action={newBrandButton}
          />
        ) : (
          <>
            <StickyToolbar>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[200px] max-w-sm flex-1">
                  <Input
                    aria-label="Поиск бренда"
                    placeholder="Название, slug или алиас…"
                    icon={<Search className="h-4 w-4" />}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <span className="text-[12.5px] text-[var(--text-muted)]">
                  <b className="tabular text-[var(--text)]">{visible.length}</b> из <b className="tabular text-[var(--text)]">{brands.length}</b>
                </span>
              </div>
              <div className="thin-scroll mt-2 flex gap-2 overflow-x-auto pb-0.5">
                <FilterChip active={filters.has("empty")} onClick={() => toggleFilter("empty")} count={emptyCount}>
                  Без товаров
                </FilterChip>
                <FilterChip active={filters.has("nologo")} onClick={() => toggleFilter("nologo")} count={noLogoCount}>
                  Без логотипа
                </FilterChip>
                <FilterChip active={filters.has("dupes")} onClick={() => toggleFilter("dupes")} count={dupes.size}>
                  Возможные дубликаты
                </FilterChip>
              </div>
            </StickyToolbar>

            <BrandDupes groups={groups} onMerge={setMerging} onDismiss={dismiss} />

            {visible.length === 0 ? (
              <EmptyState icon={Search} title="Ничего не найдено" description="Поиск идёт по названию, slug и алиасам; проверьте и чипы-фильтры." />
            ) : (
              <BrandsList
                brands={visible}
                actions={{ edit: openForm, merge: (b) => setMerging([b]), remove }}
                selection={{ ids: selected, toggle: toggleOne, toggleAll }}
                sort={{ ...sort, onSort }}
                dupes={dupes}
              />
            )}
          </>
        )}
      </QueryState>

      <BulkBar count={chosen.length} noun={plural(chosen.length, "бренд", "бренда", "брендов")} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="accent" onClick={() => setMerging(chosen)}>
          Объединить в…
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={<Trash2 className="h-3.5 w-3.5" />}
          disabled={chosenEmpty.length === 0}
          loading={deleteBrands.isPending}
          title={chosenEmpty.length === 0 ? "Среди выбранных нет брендов без товаров" : undefined}
          onClick={() => void removeEmpty()}
        >
          Удалить пустые{chosenEmpty.length ? ` · ${chosenEmpty.length}` : ""}
        </Button>
      </BulkBar>

      <BrandFormModal
        open={formOpen}
        editing={editing}
        brands={brands}
        onClose={() => setFormOpen(false)}
        onOpenExisting={setEditing}
        onMergeExisting={(b) => {
          if (!editing) return;
          setFormOpen(false);
          setMerging([editing, b]);
        }}
      />
      <MergeBrandModal group={merging} brands={brands} onClose={() => setMerging(null)} />
    </div>
  );
}
