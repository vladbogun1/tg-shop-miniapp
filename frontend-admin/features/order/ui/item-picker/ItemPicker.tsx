"use client";

/**
 * ItemPicker — admin picks a product (and variant, if any) to ADD to an order:
 * a normal paid line, or a free gift (toggle). Stock is reserved server-side so the
 * unit can't be sold to someone else. Used to edit an order's composition (add/replace).
 */
import { useMemo, useState } from "react";
import { Gift, Plus } from "lucide-react";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import type { Product, ProductVariant } from "@shop/core/types";
import { Toggle } from "@/components/ui/Toggle";
import { availableStock, canAddItem, filterPickable } from "../../model/item-picker";
import { useAddOrderItem, useGiftLimitQuery, useProductPickQuery } from "../../queries/items";
import { GiftLimitNote } from "./GiftLimitNote";
import { PickList } from "./PickList";
import { SelectedItem } from "./SelectedItem";

interface Props {
  open: boolean;
  orderId: string | null;
  defaultGift?: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ItemPicker({ open, orderId, defaultGift = false, onClose, onDone }: Props) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  // Text, not a number: "Math.max(1, …)" turned an erased field back into "1", so typing "3" gave "13".
  const [qtyText, setQtyText] = useState("1");
  const qty = Math.max(0, parseInt(qtyText, 10) || 0);
  const [gift, setGift] = useState(defaultGift);
  const [notify, setNotify] = useState(true);

  const { data: products = [] } = useProductPickQuery(open);
  // The tax-free gift limit of this order's customer (gift.monthlyLimitUah): warned about, never blocked.
  const { data: giftLimit } = useGiftLimitQuery(orderId, open && gift);
  const add = useAddOrderItem(orderId);

  const filtered = useMemo(() => filterPickable(products, q), [products, q]);

  const available = availableStock(selected, variant);
  const canAdd = canAddItem(selected, variant, qty);

  function reset() {
    setSelected(null);
    setVariant(null);
    setQtyText("1");
    setGift(defaultGift);
    setQ("");
  }

  function submit() {
    if (!orderId || !selected || !canAdd) return;
    add.mutate(
      { productId: selected.id, variantId: variant?.id, quantity: qty, gift, notifyCustomer: notify },
      {
        onSuccess: () => {
          reset();
          onDone();
          onClose();
        },
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="md"
      closeOnBackdrop={false}
      dirty={!!selected}
      title="Добавить в заказ"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Toggle checked={notify} onChange={setNotify} label="Уведомить клиента" />
          <Button
            variant="accent"
            loading={add.isPending}
            disabled={!canAdd}
            icon={gift ? <Gift className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            onClick={submit}
          >
            {gift ? "Добавить подарок" : "Добавить товар"}
          </Button>
        </div>
      }
    >
      {gift && giftLimit && <GiftLimitNote limit={giftLimit} addMinor={selected ? selected.priceMinor * Math.max(qty, 1) : 0} />}
      {!selected ? (
        <PickList
          q={q}
          onQ={setQ}
          products={filtered}
          onPick={(p) => {
            setSelected(p);
            setVariant(null);
            setQtyText("1");
          }}
        />
      ) : (
        <SelectedItem
          product={selected}
          variant={variant}
          onVariant={(v) => {
            setVariant(v);
            setQtyText("1");
          }}
          qtyText={qtyText}
          qty={qty}
          available={available}
          onQtyText={setQtyText}
          onQtyBlur={() => qty < 1 && setQtyText("1")}
          gift={gift}
          onGift={setGift}
          onReset={reset}
        />
      )}
    </Modal>
  );
}
