"use client";

/**
 * Fix the recipient and the Nova Poshta branch (PATCH /orders/{id}/delivery) — before this a typo in
 * the phone or the branch meant rejecting the order and asking the customer to order again.
 * City and branch are picked from the Nova Poshta directory, so the refs stay valid.
 */
import { useCallback, useEffect, useState } from "react";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { orderApi, type AdminOrderDetail, type DeliveryPatch, type NpCity, type NpWarehouse } from "../../api";
import { MIN_PHONE_DIGITS, buildDeliveryPatch, isDeliveryInvalid, phoneDigits, placeOf, type Place } from "../../model/delivery-edit";

/** Город и отделение Новой Почты из справочника: отделение выбирается после города. */
function NpFields({
  city,
  wh,
  setCity,
  setWh,
}: {
  city: Place | null;
  wh: Place | null;
  setCity: (p: Place | null) => void;
  setWh: (p: Place | null) => void;
}) {
  const fetchCities = useCallback((q: string) => orderApi.npCities(q), []);
  const cityRef = city?.ref;
  const fetchWarehouses = useCallback(
    (q: string) => (cityRef ? orderApi.npWarehouses(cityRef, q) : Promise.resolve([] as NpWarehouse[])),
    [cityRef],
  );
  return (
    <>
      <Autocomplete<NpCity>
        label="Город"
        placeholder="Начните вводить город…"
        selectedLabel={city?.name ?? null}
        fetchItems={fetchCities}
        itemKey={(c) => c.ref}
        itemLabel={(c) => c.name}
        itemSubLabel={(c) => c.area ?? ""}
        onSelect={(c) => {
          setCity({ ref: c.ref, name: c.name });
          setWh(null);
        }}
        onClear={() => {
          setCity(null);
          setWh(null);
        }}
      />
      {city && (
        <Autocomplete<NpWarehouse>
          label="Отделение / почтомат"
          placeholder="Номер или адрес…"
          selectedLabel={wh?.name ?? null}
          fetchItems={fetchWarehouses}
          itemKey={(w) => w.ref}
          itemLabel={(w) => w.description}
          onSelect={(w) => setWh({ ref: w.ref, name: w.description })}
          onClear={() => setWh(null)}
        />
      )}
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
  const form = useForm<{ name: string; phone: string }>({ defaultValues: { name: "", phone: "" } });
  const { reset } = form;
  const { name, phone } = form.watch();
  const [city, setCity] = useState<Place | null>(null);
  const [wh, setWh] = useState<Place | null>(null);

  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open || !order) return;
    reset({ name: order.customerName ?? "", phone: order.phone ?? "" });
    setCity(placeOf(order.npCityRef, order.npCityName));
    setWh(placeOf(order.npWarehouseRef, order.npWarehouseName));
    // Only on (re)open — not when the same order refetches while the form is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, reset]);

  if (!order) return null;
  const isNp = order.deliveryMethod === "NOVA_POSHTA";
  const patch = buildDeliveryPatch(order, name, phone, city, wh);
  const changed = Object.keys(patch).length > 0;
  const digits = phoneDigits(phone);
  const invalid = isDeliveryInvalid(isNp, name, phone, city, wh);

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
          error={phone && digits < MIN_PHONE_DIGITS ? "Минимум 10 цифр" : undefined}
        />
        {isNp && <NpFields city={city} wh={wh} setCity={setCity} setWh={setWh} />}
        <p className="text-[12px] text-[var(--text-faint)]">
          Изменения попадут в журнал, карточки в Telegram обновятся. Клиенту ничего не отправляется.
          {order.status === "SHIPPED" && " Заказ уже отправлен — переадресуйте посылку в кабинете Новой Почты."}
        </p>
      </div>
    </Modal>
  );
}
