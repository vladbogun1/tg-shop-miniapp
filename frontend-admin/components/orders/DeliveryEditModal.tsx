"use client";

/**
 * Fix the recipient and the Nova Poshta branch (PATCH /orders/{id}/delivery) — before this a typo in
 * the phone or the branch meant rejecting the order and asking the customer to order again.
 * City and branch are picked from the Nova Poshta directory, so the refs stay valid.
 */
import { useCallback, useEffect, useState } from "react";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Autocomplete } from "@/components/ui/Autocomplete";
import { ordersApi, type AdminOrderDetail, type DeliveryPatch, type NpCity, type NpWarehouse } from "@/lib/orders-api";

interface Place {
  ref: string;
  name: string;
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState<Place | null>(null);
  const [wh, setWh] = useState<Place | null>(null);

  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open || !order) return;
    setName(order.customerName ?? "");
    setPhone(order.phone ?? "");
    setCity(order.npCityRef && order.npCityName ? { ref: order.npCityRef, name: order.npCityName } : null);
    setWh(
      order.npWarehouseRef && order.npWarehouseName
        ? { ref: order.npWarehouseRef, name: order.npWarehouseName }
        : null
    );
    // Only on (re)open — not when the same order refetches while the form is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const fetchCities = useCallback((q: string) => ordersApi.npCities(q), []);
  const cityRef = city?.ref;
  const fetchWarehouses = useCallback(
    (q: string) => (cityRef ? ordersApi.npWarehouses(cityRef, q) : Promise.resolve([] as NpWarehouse[])),
    [cityRef]
  );

  if (!order) return null;
  const isNp = order.deliveryMethod === "NOVA_POSHTA";

  const patch: DeliveryPatch = {};
  if (name.trim() !== (order.customerName ?? "")) patch.customerName = name.trim();
  if (phone.trim() !== (order.phone ?? "")) patch.phone = phone.trim();
  const addressChanged =
    isNp && !!city && !!wh && (wh.ref !== order.npWarehouseRef || city.ref !== order.npCityRef);
  if (addressChanged && city && wh) {
    patch.npCityRef = city.ref;
    patch.npCityName = city.name;
    patch.npWarehouseRef = wh.ref;
    patch.npWarehouseName = wh.name;
  }
  const changed = Object.keys(patch).length > 0;
  const phoneDigits = phone.replace(/\D/g, "").length;
  const invalid = !name.trim() || phoneDigits < 10 || (isNp && (!city || !wh));

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
        <Input label="ФИО получателя" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <Input
          label="Телефон"
          value={phone}
          inputMode="tel"
          onChange={(e) => setPhone(e.target.value)}
          error={phone && phoneDigits < 10 ? "Минимум 10 цифр" : undefined}
        />
        {isNp && (
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
        )}
        <p className="text-[12px] text-[var(--text-faint)]">
          Изменения попадут в журнал, карточки в Telegram обновятся. Клиенту ничего не отправляется.
          {order.status === "SHIPPED" && " Заказ уже отправлен — переадресуйте посылку в кабинете Новой Почты."}
        </p>
      </div>
    </Modal>
  );
}
