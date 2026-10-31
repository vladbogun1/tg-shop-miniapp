"use client";

/**
 * Поставка: создание и правка. Срок — дата / диапазон / «примерно через N недель» / не показывать.
 * Закупочная цена и курс — только главному админу. Позиции правятся, пока поставка не приехала.
 *
 * Форма на useForm как хранилище значений. Проверка и «изменено» оставлены прежними: одна ошибка в подвале
 * (первая из списка), а «изменено» — после любой правки, как и раньше (isDirty из react-hook-form гаснет при
 * возврате значения, и окно закрывалось бы без вопроса).
 */
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Plus } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { useShopSetting } from "@/features/settings";
import { useIsSuperAdmin } from "@/features/staff";
import { CURRENCIES, DISTRIBUTIONS, isOpenStatus } from "../model/batch";
import {
  extraSeedLines,
  initialValues,
  newLineKey,
  toBatchRequest,
  validateBatchForm,
  type BatchFormValues,
  type PickedProduct,
  type SeedLine,
} from "../model/batch-form";
import type { Batch, Distribution } from "../model/types";
import { useSaveBatch, useSuppliers } from "../queries";
import { BatchEtaFields } from "./BatchEtaFields";
import { BatchLines } from "./BatchLines";
import { SupplierModal } from "./SupplierModal";
import { VariantPickModal } from "./VariantPickModal";

/** Окно выбора товара отдаёт экран-хозяин (фича «товар» стоит выше): так нет цикла между фичами. */
export type ProductPicker = ComponentType<{ open: boolean; title: string; onClose: () => void; onPick: (p: PickedProduct) => void }>;

export type { SeedLine } from "../model/batch-form";

export function BatchFormModal({
  open,
  onClose,
  batch,
  seed,
  onSaved,
  ProductPicker,
}: {
  open: boolean;
  onClose: () => void;
  /** Есть — правка, нет — создание. */
  batch?: Batch | null;
  /** Позиции для новой поставки («Заказать у завода»); при правке — добавляются к существующим. */
  seed?: SeedLine[];
  onSaved?: (b: Batch) => void;
  ProductPicker: ProductPicker;
}) {
  const isSuper = useIsSuperAdmin();
  const defHold = useShopSetting("preorder.holdHours", 24);
  const money = batch ? batch.moneyVisible : !!isSuper;
  const itemsLocked = !!batch && !isOpenStatus(batch.status);
  const suppliersQ = useSuppliers(open);

  const form = useForm<BatchFormValues>({ defaultValues: initialValues(batch, seed, defHold) });
  const v = form.watch();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const [variantsOf, setVariantsOf] = useState<PickedProduct | null>(null);
  const [supplierModal, setSupplierModal] = useState(false);

  const set = useCallback(
    <K extends keyof BatchFormValues>(key: K, value: BatchFormValues[K]) => {
      form.setValue(key, value as never);
      setDirty(true);
    },
    [form],
  );

  // Заполняем форму при каждом открытии и при смене поставки в открытом окне. Эффект срабатывает только на смену
  // ключа сессии: фоновое обновление batch/seed/defHold значений формы не перетирает.
  const sessionKey = open ? String(batch?.id ?? "new") : null;
  const appliedKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (appliedKey.current === sessionKey) return;
    appliedKey.current = sessionKey;
    if (sessionKey == null) return;
    setError(null);
    setDirty(false);
    const values = initialValues(batch, seed, defHold);
    if (batch) {
      const extra = extraSeedLines(batch, seed);
      values.lines = [...values.lines, ...extra];
      if (extra.length > 0) setDirty(true);
    }
    form.reset(values);
  }, [sessionKey, batch, seed, defHold, form]);

  function addLine(p: PickedProduct, variantId: string | null, variantName: string | null) {
    if (v.lines.some((l) => l.productId === p.id && l.variantId === variantId)) return;
    const line = { key: newLineKey(), id: null, productId: p.id, variantId, title: p.title, variantName, imageUrl: p.images?.[0]?.url ?? null, qty: "1", price: "" };
    set("lines", [...v.lines, line]);
  }

  const save = useSaveBatch({
    onSaved: (b) => {
      setDirty(false);
      onSaved?.(b);
      onClose();
    },
    onError: setError,
  });

  function submit() {
    setError(null);
    const problem = validateBatchForm(v, itemsLocked, money);
    if (problem) return setError(problem);
    save.mutate({ id: batch?.id ?? null, body: toBatchRequest(v, { money, itemsLocked, defHold }) });
  }

  const supplierOptions = [{ value: "", label: "— без поставщика —" }, ...(suppliersQ.data ?? []).map((s) => ({ value: String(s.id), label: s.name }))];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        dirty={dirty}
        title={batch ? "Поставка" : "Новая поставка"}
        footer={
          <>
            {error && <p className="mr-auto min-w-0 text-[13px] text-[var(--danger-ink)]">{error}</p>}
            <ModalCancel />
            <Button variant="accent" loading={save.isPending} onClick={submit}>
              {batch ? "Сохранить" : "Создать"}
            </Button>
          </>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Input label="Название (для себя)" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Lamzu, заказ 27.10" />

          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Select label="Поставщик" value={v.supplierId} options={supplierOptions} onChange={(x) => set("supplierId", x)} placeholder="Выбрать…" />
            <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal(true)}>
              Новый поставщик
            </Button>
          </div>

          <Textarea label="Заметка для себя (номер заказа у завода, трек)" rows={2} value={v.privateNote} onChange={(e) => set("privateNote", e.target.value)} />
          <Textarea label="Заметка для покупателей (необязательно)" rows={2} maxLength={1000} value={v.publicNote} onChange={(e) => set("publicNote", e.target.value)} />

          <BatchEtaFields value={v} onChange={(k, x) => set(k, x as never)} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Как раздавать, когда приедет" value={v.distribution} options={DISTRIBUTIONS} onChange={(x) => set("distribution", x as Distribution)} />
            <Input label="Бронь, часов" inputMode="numeric" value={v.holdHours} onChange={(e) => set("holdHours", e.target.value.replace(/[^\d]/g, ""))} />
          </div>

          <Toggle
            checked={v.preorderOpen}
            onChange={(x) => set("preorderOpen", x)}
            label="Открыть предзаказ (покупатели могут встать в очередь на эту поставку)"
          />

          {money && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Валюта закупки" value={v.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(x) => set("currency", x)} />
              <Input label="Курс к гривне" inputMode="decimal" value={v.fxRate} onChange={(e) => set("fxRate", e.target.value)} placeholder="напр. 41.5" hint="Сколько ₴ за 1 единицу валюты." />
            </div>
          )}

          <BatchLines lines={v.lines} locked={itemsLocked} money={money} currency={v.currency} onChange={(l) => set("lines", l)} onAdd={() => setPick(true)} />
        </div>
      </Modal>

      <ProductPicker
        open={pick}
        title="Товар в поставку"
        onClose={() => setPick(false)}
        onPick={(p) => (p.variants && p.variants.length > 0 ? setVariantsOf(p) : addLine(p, null, null))}
      />
      <VariantPickModal product={variantsOf} lines={v.lines} onAdd={addLine} onClose={() => setVariantsOf(null)} />
      <SupplierModal open={supplierModal} onClose={() => setSupplierModal(false)} onCreated={(s) => set("supplierId", String(s.id))} />
    </>
  );
}
