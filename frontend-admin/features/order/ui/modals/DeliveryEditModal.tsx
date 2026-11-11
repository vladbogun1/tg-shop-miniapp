"use client";

/**
 * Fix the recipient and the Nova Poshta address (PATCH /orders/{id}/delivery) — before this a typo in
 * the phone or the branch meant rejecting the order and asking the customer to order again.
 * City, branch / postomat and street are picked from the Nova Poshta directory, so the refs stay valid;
 * a street NP does not know can be typed by hand. The recipient for the waybill goes in parts
 * (surname / name / patronymic) — NP wants them separately.
 */
import { useLayoutEffect, useState } from "react";
import { useForm, type ShopForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { useLatestRef } from "../use-latest-ref";
import type { AdminOrderDetail, DeliveryPatch } from "../../api";
import {
  MIN_PHONE_DIGITS,
  buildDeliveryPatch,
  draftOf,
  isDeliveryInvalid,
  phoneDigits,
  recipientMissing,
  type DeliveryDraft,
  type DeliveryText,
} from "../../model/delivery-edit";
import { NpAddressFields, type NpAddressState } from "./NpAddressFields";

const EMPTY_TEXT: DeliveryText = { name: "", phone: "", building: "", flat: "", last: "", first: "", middle: "" };
const EMPTY_ADDRESS: NpAddressState = { city: null, wh: null, service: "WAREHOUSE", street: null };

function textOf(d: DeliveryDraft): DeliveryText {
  return { name: d.name, phone: d.phone, building: d.building, flat: d.flat, last: d.last, first: d.first, middle: d.middle };
}

function RecipientNameFields({ register, missing }: { register: ShopForm<DeliveryText>["register"]; missing: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input label="Фамилия" {...register("last")} autoComplete="off" />
        <Input label="Имя" {...register("first")} autoComplete="off" />
        <Input label="Отчество" {...register("middle")} autoComplete="off" />
      </div>
      {missing && <p className="text-[12px] text-[var(--danger-ink)]">Фамилия и имя не могут быть пустыми.</p>}
    </>
  );
}

export function DeliveryEditModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  onSave: (patch: DeliveryPatch) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const form = useForm<DeliveryText>({ defaultValues: EMPTY_TEXT });
  const { reset } = form;
  const text = form.watch();
  const [address, setAddress] = useState<NpAddressState>(EMPTY_ADDRESS);

  const orderId = order?.id ?? null;
  // Only on (re)open — not when the same order refetches while the form is being edited.
  const orderRef = useLatestRef(order);
  useLayoutEffect(() => {
    const current = orderRef.current;
    if (!open || !current) return;
    const d = draftOf(current);
    reset(textOf(d));
    setAddress({ city: d.city, wh: d.wh, service: d.service, street: d.street });
  }, [open, orderId, reset, orderRef]);

  if (!order) return null;
  const isNp = order.deliveryMethod === "NOVA_POSHTA";
  const draft: DeliveryDraft = { ...text, ...address };
  const patch = buildDeliveryPatch(order, draft);
  const changed = Object.keys(patch).length > 0;
  const invalid = isDeliveryInvalid(order, draft);

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={changed}
      title="Получатель и доставка"
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={loading} disabled={!changed || invalid} onClick={() => onSave(patch)}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="ФИО получателя" {...form.register("name")} autoComplete="off" />
        <Input
          label="Телефон"
          inputMode="tel"
          {...form.register("phone")}
          error={text.phone && phoneDigits(text.phone) < MIN_PHONE_DIGITS ? "Минимум 10 цифр" : undefined}
        />
        {isNp && (
          <>
            <RecipientNameFields register={form.register} missing={recipientMissing(order, draft)} />
            <NpAddressFields value={address} onChange={(p) => setAddress((a) => ({ ...a, ...p }))} register={form.register} />
          </>
        )}
        <p className="text-[12px] text-[var(--text-faint)]">
          Изменения попадут в журнал, карточки в Telegram обновятся. Клиенту ничего не отправляется.
          {order.status === "SHIPPED" && " Заказ уже отправлен — переадресуйте посылку в кабинете Новой Почты."}
        </p>
      </div>
    </Modal>
  );
}
