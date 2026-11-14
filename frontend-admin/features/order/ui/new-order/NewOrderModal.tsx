"use client";

/**
 * NewOrderModal — a manual order: a sale made outside the site (phone, Instagram, in person).
 * POST /api/admin/orders. Prices, stock, promo code and variants are checked by the backend with the
 * rules of a normal checkout; its 400 message is shown under the form.
 *
 * `from` — «Новый заказ этому покупателю»: from an order (its drawer) or a customer (their profile, by their
 * latest order) the buyer, the Telegram id and the address come filled in; the goods and the payment are new.
 * Every open starts from that again (a closed window does not keep a half-typed order).
 */
import { useLayoutEffect, useMemo, useState } from "react";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePaymentOptionsQuery } from "@/features/payment";
import type { Product, ProductVariant } from "@shop/core/types";
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
import type { NewOrderFrom } from "../../model/new-order-prefill";
import { useCreateOrder } from "../../queries/create";
import { useProductPickQuery } from "../../queries/items";
import { useNewOrderPrefill } from "../../queries/new-order-prefill";
import { useLatestRef } from "../use-latest-ref";
import { LineRow } from "./LineRow";
import { CustomerSection, DeliverySection, PaymentSection } from "./OrderFormSections";
import { ProductSearch } from "./ProductSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  /** The created order's id — the page opens it. */
  onCreated: (orderId: string) => void;
  /** The buyer to fill in; none = a blank form. */
  from?: NewOrderFrom | null;
}

export function NewOrderModal({ open, onClose, onCreated, from }: Props) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [q, setQ] = useState("");
  const [values, setValues] = useState<NewOrderValues>(EMPTY_NEW_ORDER);
  const [start, setStart] = useState<NewOrderValues>(EMPTY_NEW_ORDER);
  const [legacyAddress, setLegacyAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prefill = useNewOrderPrefill(from, open);
  const ready = prefill !== null;
  const prefillRef = useLatestRef(prefill);
  // On every open, once the buyer is known — not when the source order refetches while the form is typed in.
  useLayoutEffect(() => {
    const p = prefillRef.current;
    if (!open || !p) return;
    setLines([]);
    setQ("");
    setValues(p.values);
    setStart(p.values);
    setLegacyAddress(p.legacyAddress);
    setError(null);
  }, [open, ready, prefillRef]);

  const { data: products = [] } = useProductPickQuery(open);
  const { data: payments = [] } = usePaymentOptionsQuery("active", { enabled: open });
  const paymentOptions = useMemo(() => payments.filter((p) => !!p.id).map((p) => ({ value: p.id as string, label: p.title })), [payments]);
  const found = useMemo(() => searchProducts(products, q), [products, q]);

  const total = lines.reduce((sum, l) => sum + l.product.priceMinor * qtyOf(l), 0);
  const canSubmit = ready && canSubmitOrder(lines, values);

  const create = useCreateOrder(
    (orderId) => {
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
      dirty={ready && isOrderDirty(lines, values, start)}
      title={from ? "Новый заказ этому покупателю" : "Новый заказ"}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <ModalCancel disabled={create.isPending} />
          <Button variant="accent" loading={create.isPending} disabled={!canSubmit} onClick={submit}>
            Создать заказ
          </Button>
        </div>
      }
    >
      {ready ? (
        <div className="flex flex-col gap-5">
          <p className="text-[12.5px] leading-snug text-[var(--text-faint)]">
            {from
              ? "Покупатель и адрес — из его заказа, проверьте. Товары и оплату выберите заново."
              : "Продажа вне сайта: по телефону, в Instagram, лично. Цены, склад и промокод проверит сервер."}
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
          <DeliverySection values={values} onChange={patch} onDelivery={pickDelivery} legacyAddress={legacyAddress} />
          <PaymentSection values={values} onChange={patch} paymentOptions={paymentOptions} />

          {error && (
            <p role="alert" className="text-[13px] font-semibold text-[var(--danger-ink)]">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем данные покупателя">
          <Skeleton className="h-10 rounded-[var(--r-md)]" />
          <Skeleton className="h-24 rounded-[var(--r-md)]" />
          <Skeleton className="h-24 rounded-[var(--r-md)]" />
        </div>
      )}
    </Modal>
  );
}
