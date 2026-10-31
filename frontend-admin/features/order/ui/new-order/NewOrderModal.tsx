"use client";

/**
 * NewOrderModal — a manual order: a sale made outside the site (phone, Instagram, in person).
 * POST /api/admin/orders. Prices, stock, promo code and variants are checked by the backend with the
 * rules of a normal checkout; its 400 message is shown under the form.
 */
import { useMemo, useState } from "react";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { usePaymentOptionsQuery } from "@/features/payment";
import type { Product, ProductVariant } from "@/lib/api";
import { money } from "@/lib/money";
import {
  addOrderLine,
  buildCreateBody,
  canSubmitOrder,
  defaultChannel,
  EMPTY_NEW_ORDER,
  isOrderDirty,
  qtyOf,
  searchProducts,
  type Delivery,
  type NewOrderValues,
  type OrderLine,
} from "../../model/new-order";
import { useCreateOrder } from "../../queries/create";
import { useProductPickQuery } from "../../queries/items";
import { LineRow } from "./LineRow";
import { CustomerSection, DeliverySection, PaymentSection } from "./OrderFormSections";
import { ProductSearch } from "./ProductSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The created order's id — the page opens it. */
  onCreated: (orderId: string) => void;
}

export function NewOrderModal({ open, onClose, onCreated }: Props) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [q, setQ] = useState("");
  const [values, setValues] = useState<NewOrderValues>(EMPTY_NEW_ORDER);
  const [error, setError] = useState<string | null>(null);

  const { data: products = [] } = useProductPickQuery(open);
  const { data: payments = [] } = usePaymentOptionsQuery("active", { enabled: open });
  const paymentOptions = useMemo(() => payments.filter((p) => !!p.id).map((p) => ({ value: p.id as string, label: p.title })), [payments]);
  const found = useMemo(() => searchProducts(products, q), [products, q]);

  const total = lines.reduce((sum, l) => sum + l.product.priceMinor * qtyOf(l), 0);
  const canSubmit = canSubmitOrder(lines, values);

  function reset() {
    setLines([]);
    setQ("");
    setValues(EMPTY_NEW_ORDER);
    setError(null);
  }

  const create = useCreateOrder(
    (orderId) => {
      reset();
      onClose();
      onCreated(orderId);
    },
    setError
  );

  const patch = (p: Partial<NewOrderValues>) => setValues((cur) => ({ ...cur, ...p }));
  const addLine = (product: Product, variant: ProductVariant | null) => {
    setLines((cur) => addOrderLine(cur, product, variant));
    setQ("");
  };
  const pickDelivery = (d: Delivery) =>
    setValues((cur) => ({ ...cur, delivery: d, channel: cur.channelTouched ? cur.channel : defaultChannel(d) }));
  const setQty = (key: string, text: string) =>
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, qtyText: text.replace(/\D/g, "").slice(0, 4) } : l)));

  function submit() {
    if (!canSubmit || create.isPending) return;
    setError(null);
    create.mutate(buildCreateBody(lines, values));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      dirty={isOrderDirty(lines, values)}
      title="Новый заказ"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <ModalCancel disabled={create.isPending} />
          <Button variant="accent" loading={create.isPending} disabled={!canSubmit} onClick={submit}>
            Создать заказ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[12.5px] leading-snug text-[var(--text-faint)]">
          Продажа вне сайта: по телефону, в Instagram, лично. Цены, склад и промокод проверит сервер.
        </p>

        {/* Items */}
        <section className="flex flex-col gap-2.5">
          <span className="field-label">Товары</span>
          {lines.map((l) => (
            <LineRow key={l.key} line={l} onQty={setQty} onRemove={(key) => setLines((cur) => cur.filter((x) => x.key !== key))} />
          ))}
          <ProductSearch q={q} onQ={setQ} found={found} onAdd={addLine} />
          {lines.length > 0 && (
            <div className="tabular text-right text-[13px] font-semibold text-[var(--text)]">Итого по прайсу: {money(total, lines[0]?.product.currency)}</div>
          )}
        </section>

        <CustomerSection values={values} onChange={patch} />
        <DeliverySection values={values} onChange={patch} onDelivery={pickDelivery} />
        <PaymentSection values={values} onChange={patch} paymentOptions={paymentOptions} />

        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
