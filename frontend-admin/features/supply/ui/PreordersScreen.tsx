"use client";

/**
 * «Поставки» (route "/preorders"): заказы у заводов и очереди ждущих покупателей.
 * Вкладки: Открытые · Приехали · Отменённые · Чего ждут · Поставщики.
 * `?newProduct=<id>` открывает форму новой поставки с этим товаром (из карточки товара и «Ждут»).
 */
import { Button } from "@shop/ui/admin-button";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { BatchFormModal, SupplierModal, useDemand, type Demand, type SeedLine } from "@/features/procurement";
import { ProductPickModal, productApi, productKeys } from "@/features/product";
import { BatchList } from "./BatchList";
import { DemandList } from "./DemandList";
import { SuppliersList } from "./SuppliersList";

type TabKey = "open" | "arrived" | "cancelled" | "demand" | "suppliers";

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
  const [tab, setTab] = useState<TabKey>(params.get("tab") === "demand" ? "demand" : "open");
  const [form, setForm] = useState<{ seed: SeedLine[] } | null>(null);
  const [supplierModal, setSupplierModal] = useState(false);

  const demandQ = useDemand();
  const productsQ = useQuery({
    queryKey: productKeys.list(),
    queryFn: () => productApi.list(),
    staleTime: 60_000,
  });

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

  const tabs = [
    { value: "open" as TabKey, label: "Открытые" },
    { value: "arrived" as TabKey, label: "Приехали" },
    { value: "cancelled" as TabKey, label: "Отменённые" },
    {
      value: "demand" as TabKey,
      label: "Чего ждут",
      count: demandQ.data?.length,
    },
    { value: "suppliers" as TabKey, label: "Поставщики" },
  ];

  return (
    <div className="min-w-0">
      <PageHeader
        title="Поставки"
        subtitle="Что заказано у заводов, кто ждёт и что делать, когда товар приехал."
        actions={
          tab === "suppliers" ? (
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal(true)}>
              Поставщик
            </Button>
          ) : (
            <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ seed: [] })}>
              Новая поставка
            </Button>
          )
        }
      />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-4" />

      {(tab === "open" || tab === "arrived" || tab === "cancelled") && <BatchList filter={tab} onCreate={() => setForm({ seed: [] })} />}
      {tab === "demand" && <DemandList q={demandQ} onOrder={(d) => setForm({ seed: [seedOf(d)] })} />}
      {tab === "suppliers" && <SuppliersList />}

      <BatchFormModal
        open={!!form}
        onClose={() => setForm(null)}
        seed={form?.seed}
        onSaved={(b) => router.push(`/preorders/${b.id}`)}
        ProductPicker={ProductPickModal}
      />
      <SupplierModal open={supplierModal} onClose={() => setSupplierModal(false)} />
    </div>
  );
}
