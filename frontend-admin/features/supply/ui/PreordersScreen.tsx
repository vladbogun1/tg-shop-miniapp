"use client";

/**
 * «Поставки» (route "/preorders"): сверху «Что заказать» (чего ждут покупатели), ниже — поставки с фильтром
 * «Едут · Приехали · Все». «Поставщики» — отдельный вид по ссылке. `?tab=demand` раскрывает «Что заказать».
 * `?newProduct=<id>` открывает форму новой поставки с этим товаром (из карточки товара и «Ждут»).
 */
import { Button } from "@shop/ui/admin-button";
import { ArrowLeft, Factory, Plus, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BatchFormModal, SupplierModal, useDemand, type BatchPreset, type Demand, type SeedLine } from "@/features/procurement";
import { PICK_PRODUCTS_STALE_MS, ProductPickModal, useProductsQuery } from "@/features/product";
import { BatchList } from "./BatchList";
import { DemandList } from "./DemandList";
import { SupplyAiModal } from "./ai/SupplyAiModal";
import { SuppliersList } from "./SuppliersList";

type Shown = "open" | "arrived" | "all";

const FILTERS: { value: Shown; label: string }[] = [
  { value: "open", label: "Едут" },
  { value: "arrived", label: "Приехали" },
  { value: "all", label: "Все" },
];

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
  const [shown, setShown] = useState<Shown>("open");
  const [suppliers, setSuppliers] = useState(false);
  const demandFirst = params.get("tab") === "demand";
  const [form, setForm] = useState<{
    seed: SeedLine[];
    preset?: BatchPreset;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);

  const demandQ = useDemand();
  const productsQ = useProductsQuery({ staleTime: PICK_PRODUCTS_STALE_MS });

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
      {suppliers ? (
        <>
          <button
            type="button"
            onClick={() => setSuppliers(false)}
            className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ArrowLeft className="h-4 w-4" /> Все поставки
          </button>
          <PageHeader
            title="Поставщики"
            subtitle="Заводы и продавцы, у которых заказываете."
            actions={
              <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal(true)}>
                Добавить поставщика
              </Button>
            }
          />
          <SuppliersList />
        </>
      ) : (
        <>
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
          <DemandList q={demandQ} expanded={demandFirst} onOrder={(d) => setForm({ seed: [seedOf(d)] })} />

          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.05em] text-[var(--ink)]">Поставки</h2>
              <SegmentedControl options={FILTERS} value={shown} onChange={setShown} />
              <button
                type="button"
                onClick={() => setSuppliers(true)}
                className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent-hi)] hover:underline"
              >
                <Factory className="h-4 w-4" /> Поставщики
              </button>
            </div>
            <BatchList filter={shown} onCreate={create} />
          </section>
        </>
      )}

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
