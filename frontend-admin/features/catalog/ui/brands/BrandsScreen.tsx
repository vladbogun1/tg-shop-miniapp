"use client";

/**
 * «Бренды» (route "/brands"): the brand directory of catalog v2 — name, URL slug, site, number of
 * products, aliases (other spellings the AI import and «Создать „…“» recognise). Create / edit,
 * delete (products stay, without a brand) and «Объединить с…» (products and aliases move to
 * another brand — for duplicates like «Attack Shark» / «AttackShark»). The logo (and how it is drawn)
 * feeds the brand marquee on the site's home page.
 */
import { BadgeCheck, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Button } from "@shop/ui/admin-button";
import { useConfirm } from "@shop/ui/confirm";
import { visibleBrands, type BrandSort } from "../../model/brands";
import type { AdminBrand } from "../../model/types";
import { productsWord } from "../../model/words";
import { useBrandsQuery, useDeleteBrand } from "../../queries";
import { BrandFormModal } from "./BrandFormModal";
import { BrandsList } from "./BrandsList";
import { MergeBrandModal } from "./MergeBrandModal";

export function BrandsScreen() {
  const confirm = useConfirm();
  const q = useBrandsQuery();
  const brands = useMemo(() => q.data ?? [], [q.data]);
  const deleteBrand = useDeleteBrand();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<BrandSort>("products");
  const [editing, setEditing] = useState<AdminBrand | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [merging, setMerging] = useState<AdminBrand | null>(null);

  const visible = useMemo(() => visibleBrands(brands, search, sort), [brands, search, sort]);
  const emptyCount = useMemo(() => brands.filter((b) => b.productCount === 0).length, [brands]);

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
    if (ok) deleteBrand.mutate(b.id);
  }

  return (
    <div>
      <PageHeader
        title="Бренды"
        subtitle="Справочник производителей: фильтр на витрине, разметка для поиска, распознавание ИИ"
        actions={
          <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
            Новый бренд
          </Button>
        }
      />

      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Загрузка брендов…">
        {brands.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title="Брендов пока нет"
            description="Добавьте бренд вручную или выберите «Создать „…“» в мастере товара — он появится здесь."
            action={
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => openForm(null)}>
                Новый бренд
              </Button>
            }
          />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[220px] max-w-sm flex-1">
                <Input
                  aria-label="Поиск бренда"
                  placeholder="Название, slug или алиас…"
                  icon={<Search className="h-4 w-4" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12.5px] text-[var(--text-muted)]">
                  <b className="tabular text-[var(--text)]">{brands.length}</b> всего · <b className="tabular text-[var(--text)]">{emptyCount}</b> без товаров
                </span>
                <SegmentedControl<BrandSort>
                  size="sm"
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: "products", label: "По товарам" },
                    { value: "name", label: "А–Я" },
                  ]}
                />
              </div>
            </div>

            {visible.length === 0 ? (
              <EmptyState icon={Search} title="Ничего не найдено" description="Поиск идёт по названию, slug и алиасам." />
            ) : (
              <BrandsList brands={visible} actions={{ edit: openForm, merge: setMerging, remove }} />
            )}
          </>
        )}
      </QueryState>

      <BrandFormModal open={formOpen} editing={editing} brands={brands} onClose={() => setFormOpen(false)} />
      <MergeBrandModal merging={merging} brands={brands} onClose={() => setMerging(null)} />
    </div>
  );
}
