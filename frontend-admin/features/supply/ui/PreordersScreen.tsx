"use client";

/**
 * «Поставки» (route "/preorders", вариант B макета): слева колонка входов — статусы поставок, «Что заказать» (чего ждут
 * покупатели), «Поставщики» — со счётчиками; на телефоне это лента чипов. `?tab=demand` открывает «Что заказать».
 * `?newProduct=<id>` открывает форму новой поставки с этим товаром (из карточки товара и «Ждут»).
 */
import { Button } from "@shop/ui/admin-button";
import { Plus, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  BatchFormModal,
  SupplierModal,
  isOpenStatus,
  useDemand,
  type BatchFilter,
  type BatchPreset,
  type Demand,
  type SeedLine,
} from "@/features/procurement";
import { PICK_PRODUCTS_STALE_MS, ProductPickModal, useProductsQuery } from "@/features/product";
import { useBatchesList, useSuppliersList } from "../queries";
import { BatchList } from "./BatchList";
import { BatchRail, type RailItem, type SupplyView } from "./BatchRail";
import { DemandList } from "./DemandList";
import { SupplyAiModal } from "./ai/SupplyAiModal";
import { SuppliersList } from "./SuppliersList";

function seedOf(d: Demand): SeedLine {
  return {
    productId: d.productId,
    variantId: d.variantId,
    title: d.title,
    variantName: d.variantName,
    imageUrl: d.imageUrl,
    qty: Math.max(1, d.units),
  };
}

export function PreordersScreen() {
  return (
    <Suspense fallback={null}>
      <PreordersBody />
    </Suspense>
  );
}

function PreordersBody() {
  const router = useRouter();
  const params = useSearchParams();
  const demandTab = params.get("tab") === "demand";
  const [view, setView] = useState<SupplyView>(demandTab ? "demand" : "open");
  useEffect(() => {
    if (demandTab) setView("demand");
  }, [demandTab]);
  const [form, setForm] = useState<{
    seed: SeedLine[];
    preset?: BatchPreset;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);

  const demandQ = useDemand();
  const allQ = useBatchesList("all");
  const suppliersQ = useSuppliersList();
  const productsQ = useProductsQuery({ staleTime: PICK_PRODUCTS_STALE_MS });

  const batches = allQ.data ?? [];
  const rail: RailItem[] = [
    { value: "open", label: "Едут", count: batches.filter((b) => isOpenStatus(b.status)).length },
    { value: "arrived", label: "Приехали", count: batches.filter((b) => b.status === "ARRIVED").length },
    { value: "cancelled", label: "Отменены", count: batches.filter((b) => b.status === "CANCELLED").length },
    { value: "all", label: "Все", count: batches.length },
    { value: "demand", label: "Что заказать", count: demandQ.data?.length ?? 0, hot: true },
    { value: "suppliers", label: "Поставщики", count: suppliersQ.data?.length },
  ];

  // Глубокая ссылка «?newProduct=id»: открыть форму с этим товаром, один раз.
  const newProduct = params.get("newProduct");
  useEffect(() => {
    if (!newProduct || !productsQ.data) return;
    const p = productsQ.data.find((x) => x.id === newProduct);
    router.replace("/preorders");
    if (!p) return;
    const img = p.images?.[0]?.url ?? null;
    const seed: SeedLine[] =
      p.variants && p.variants.length > 0
        ? p.variants.map((v) => ({
            productId: p.id,
            variantId: v.id ?? null,
            title: p.title,
            variantName: v.name,
            imageUrl: img,
          }))
        : [
            {
              productId: p.id,
              variantId: null,
              title: p.title,
              variantName: null,
              imageUrl: img,
            },
          ];
    setForm({ seed });
  }, [newProduct, productsQ.data, router]);

  const create = () => setForm({ seed: [] });

  return (
    <div className="min-w-0">
      <PageHeader
        title="Поставки"
        subtitle="Что заказали у заводов, что едет и кто его ждёт."
        actions={
          <>
            <Button variant="outline" icon={<Sparkles className="h-4 w-4" />} onClick={() => setAiOpen(true)}>
              Из накладной (ИИ)
            </Button>
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={create}>
              Новая поставка
            </Button>
          </>
        }
      />
      <div className="lg:flex lg:items-start lg:gap-6">
        <BatchRail items={rail} value={view} onChange={setView} />
        <div className="min-w-0 flex-1">
          {view === "demand" ? (
            <DemandList q={demandQ} onOrder={(rows) => setForm({ seed: rows.map(seedOf) })} />
          ) : view === "suppliers" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">Заводы и продавцы, у которых заказываете.</span>
                <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal(true)}>
                  Добавить поставщика
                </Button>
              </div>
              <SuppliersList />
            </>
          ) : (
            <BatchList filter={view satisfies BatchFilter} onCreate={create} />
          )}
        </div>
      </div>

      <BatchFormModal
        open={!!form}
        onClose={() => setForm(null)}
        seed={form?.seed}
        preset={form?.preset}
        onSaved={(b) => router.push(`/preorders/${b.id}`)}
        ProductPicker={ProductPickModal}
      />
      <SupplierModal open={supplierModal} onClose={() => setSupplierModal(false)} />
      <SupplyAiModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onReady={(r) => {
          setAiOpen(false);
          setForm(r);
        }}
      />
    </div>
  );
}
