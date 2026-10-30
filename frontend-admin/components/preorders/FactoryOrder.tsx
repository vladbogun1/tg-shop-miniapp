"use client";

/**
 * «Заказал у завода» в карточке товара с нулевым остатком: новая поставка с этим товаром
 * или добавление в уже открытую (на выбор). Дальше — обычная форма поставки.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Factory } from "lucide-react";
import { ApiError, type AdminProduct } from "@/lib/api";
import { PREORDERS_KEY, demandRowsOfProduct, etaText, preordersApi, useDemand, type Batch, type BatchSummary } from "@/lib/preorders";
import { toast } from "@shop/ui/toast";
import { Button } from "@shop/ui/admin-button";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Select } from "@/components/ui/Select";
import { BatchFormModal, type SeedLine } from "./BatchFormModal";

const NEW = "new";

export function FactoryOrderLine({ product }: { product: AdminProduct }) {
  const qc = useQueryClient();
  const demandQ = useDemand();
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<BatchSummary[] | null>(null);
  const [pick, setPick] = useState(NEW);
  const [form, setForm] = useState<{ batch: Batch | null } | null>(null);

  const units = demandRowsOfProduct(demandQ.data, product.id).reduce((n, d) => n + d.units, 0);
  const img = product.images?.[0]?.url ?? null;
  const seed: SeedLine[] =
    product.variants && product.variants.length > 0
      ? product.variants.map((v) => ({ productId: product.id, variantId: v.id ?? null, title: product.title, variantName: v.name, imageUrl: img, qty: 1 }))
      : [{ productId: product.id, variantId: null, title: product.title, variantName: null, imageUrl: img, qty: Math.max(1, units) }];

  async function start() {
    setBusy(true);
    try {
      const open = await preordersApi.batches("open");
      if (open.length === 0) setForm({ batch: null });
      else {
        setPick(NEW);
        setChoice(open);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось открыть поставки");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (pick === NEW) {
      setChoice(null);
      setForm({ batch: null });
      return;
    }
    setBusy(true);
    try {
      const b = await qc.fetchQuery({ queryKey: [...PREORDERS_KEY, "batch", pick], queryFn: () => preordersApi.batch(pick), staleTime: 0 });
      setChoice(null);
      setForm({ batch: b });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось открыть поставку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card-2 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[13px]">
        <span className="text-[var(--text-muted)]">Остаток 0. Уже заказали у завода?</span>
        <Button size="sm" variant="outline" icon={<Factory className="h-4 w-4" />} loading={busy} onClick={start}>
          Заказал у завода
        </Button>
      </div>

      <Modal
        open={!!choice}
        onClose={() => setChoice(null)}
        size="sm"
        title="Заказал у завода"
        footer={
          <>
            <ModalCancel />
            <Button variant="accent" loading={busy} onClick={next}>
              Дальше
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[var(--text-muted)]">Создать новую поставку с этим товаром или добавить его в уже открытую?</p>
          <Select
            label="Куда"
            value={pick}
            onChange={setPick}
            options={[
              { value: NEW, label: "Новая поставка" },
              ...(choice ?? []).map((b) => ({ value: String(b.id), label: `${b.title} · срок: ${etaText(b)}` })),
            ]}
          />
        </div>
      </Modal>

      <BatchFormModal open={!!form} onClose={() => setForm(null)} batch={form?.batch ?? null} seed={seed} />
    </>
  );
}
