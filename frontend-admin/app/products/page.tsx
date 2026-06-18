"use client";

/**
 * Products (route "/products") — grid of products (GET /api/admin/products),
 * with an archived view toggle. Create/edit modal, active/archived toggles.
 * Delete = archive (docs/SPEC.md).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Archive, ArchiveRestore, Pencil } from "lucide-react";
import { adminApi, ApiError, type Product } from "@/lib/api";
import { money } from "@/lib/money";
import { Image } from "@/lib/image";
import { GlassChip } from "@/components/ui/GlassChip";
import { GlassButton } from "@/components/ui/GlassButton";
import { GlassToggle } from "@/components/ui/GlassToggle";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductModal } from "@/components/products/ProductModal";
import { useToast } from "@/lib/toast";

export default function ProductsPage() {
  const qc = useQueryClient();
  const { push } = useToast();
  const [archivedView, setArchivedView] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", archivedView],
    queryFn: () => (archivedView ? adminApi.productsArchived() : adminApi.products()),
  });
  const { data: tags = [] } = useQuery({ queryKey: ["tags"], queryFn: () => adminApi.tags() });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  async function setActive(p: Product, active: boolean) {
    try {
      await adminApi.setProductActive(p.id, active);
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    }
  }
  async function setArchived(p: Product, archived: boolean) {
    try {
      await adminApi.setProductArchived(p.id, archived);
      push(archived ? "В архиве" : "Восстановлен", "ok");
      refresh();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Ошибка", "error");
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <GlassChip active={!archivedView} onClick={() => setArchivedView(false)}>
            Активные
          </GlassChip>
          <GlassChip active={archivedView} onClick={() => setArchivedView(true)}>
            Архив
          </GlassChip>
        </div>
        <GlassButton
          variant="accent"
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          Новый товар
        </GlassButton>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="glass rounded-[var(--r-lg)] px-4 py-16 text-center text-[var(--text-faint)]">
          {archivedView ? "Архив пуст" : "Товаров пока нет"}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <div key={p.id} className="glass flex flex-col overflow-hidden rounded-[var(--r-lg)]">
              <Image
                src={p.images?.[0]?.url}
                alt={p.title}
                size={400}
                className="aspect-square w-full"
              />
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-[14px] font-semibold text-[var(--text)]">
                    {p.title}
                  </h3>
                  {!p.active && !archivedView && <Badge color="var(--warn)">скрыт</Badge>}
                </div>
                <div className="mt-1 text-[15px] font-bold text-[var(--text)]">
                  {money(p.priceMinor, p.currency)}
                </div>
                <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Остаток: {p.stock ?? 0}
                  {p.variants && p.variants.length > 0 ? ` · ${p.variants.length} вар.` : ""}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                  {!archivedView ? (
                    <>
                      <GlassToggle checked={!!p.active} onChange={(v) => setActive(p, v)} />
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditing(p);
                            setModalOpen(true);
                          }}
                          className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--text)]"
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setArchived(p, true)}
                          className="grid h-9 w-9 place-items-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-white/10 hover:text-[var(--danger)]"
                          aria-label="В архив"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  ) : (
                    <GlassButton
                      size="sm"
                      variant="glass"
                      fullWidth
                      icon={<ArchiveRestore className="h-4 w-4" />}
                      onClick={() => setArchived(p, false)}
                    >
                      Восстановить
                    </GlassButton>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProductModal
        open={modalOpen}
        product={editing}
        tags={tags}
        onClose={() => setModalOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
