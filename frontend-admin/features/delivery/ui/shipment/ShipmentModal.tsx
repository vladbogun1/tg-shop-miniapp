"use client";

/**
 * «Створити / Редагувати / Перестворити ТТН» — окно с живым предпросмотром.
 *
 * Первый предпросмотр (POST …/shipment/preview без опций) даёт значения по умолчанию из заказа, товаров и
 * настроек — ими заполняется форма. Любая правка — новый предпросмотр всей формы (с задержкой 500 мс), так что
 * проблемы, предупреждения, оценка и комиссия всегда про то, что уйдёт по кнопке. Создание — POST, правка и
 * пересоздание — PUT (напечатанную ТТН сервер удаляет и создаёт новую). Неоплаченный онлайн-заказ — явная
 * галочка `allowUnpaid` (код сервера ORDER_UNPAID_SHIP).
 */
import { useMemo, useState } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { errorMessage } from "@shop/core/errors";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { useDebounced } from "@/lib/use-debounced";
import { boxError, formFrom, submitBlocked, toOptions, type ShipmentForm, type ShipmentMode } from "../../model/shipment-form";
import type { Shipment } from "../../model/types";
import { useSaveShipment, useShipmentPreviewQuery } from "../../queries";
import { ShipmentBody } from "./ShipmentBody";

const DEFAULTS = "{}";
const PREVIEW_DEBOUNCE_MS = 500;

const TITLE: Record<ShipmentMode, string> = { create: "Створити ТТН", edit: "Редагувати ТТН", remake: "Перестворити ТТН" };
const SUBMIT: Record<ShipmentMode, string> = { create: "Створити ТТН", edit: "Сохранить ТТН", remake: "Перестворити ТТН" };

/** Форма поверх значений по умолчанию + живой предпросмотр именно этой формы. */
function useShipmentDraft(orderId: string, mode: ShipmentMode) {
  const initialQ = useShipmentPreviewQuery(orderId, DEFAULTS, true);
  const initial = initialQ.data;
  const [edited, setEdited] = useState<ShipmentForm | null>(null);
  const base = useMemo(() => (initial ? formFrom(initial, mode === "edit") : null), [initial, mode]);
  const form = edited ?? base;

  const optionsJson = form ? JSON.stringify(toOptions(form)) : DEFAULTS;
  // Правка начинает с коробки самой ТТН, которую первый предпросмотр не учитывал: пересчитать сразу.
  const baselineJson = base && mode !== "edit" ? JSON.stringify(toOptions(base)) : "";
  const debounced = useDebounced(optionsJson, PREVIEW_DEBOUNCE_MS);
  const live = !!form && debounced !== baselineJson;
  const liveQ = useShipmentPreviewQuery(orderId, debounced, live && !!initial && !boxError(form));

  const set = (patch: Partial<ShipmentForm>) =>
    setEdited((f) => {
      const cur = f ?? base;
      return cur ? { ...cur, ...patch } : f;
    });
  return {
    initial,
    initialError: initialQ.error ? errorMessage(initialQ.error, undefined, "Не удалось рассчитать ТТН") : null,
    form,
    set,
    dirty: edited !== null,
    preview: live ? (liveQ.data ?? initial) : initial,
    loading: (live && liveQ.isFetching) || debounced !== optionsJson,
    loadError: live && liveQ.error ? errorMessage(liveQ.error, undefined, "Не удалось пересчитать ТТН") : null,
  };
}

function Loading({ error }: { error: string | null }) {
  return (
    <div className="grid min-h-40 place-items-center">
      {error ? (
        <p className="flex items-start gap-2 text-[13px] text-[var(--danger-ink)]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : (
        <span className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Считаем ТТН…
        </span>
      )}
    </div>
  );
}

export function ShipmentModal({
  orderId,
  mode,
  onClose,
  onDone,
}: {
  orderId: string;
  mode: ShipmentMode;
  onClose: () => void;
  /** ТТН создана / изменена: перечитать заказ и списки. */
  onDone: (s: Shipment) => void;
}) {
  const d = useShipmentDraft(orderId, mode);
  const save = useSaveShipment(orderId, mode, d.initial?.existing?.ttn, onDone);
  const blocked = !d.form || submitBlocked({ form: d.form, preview: d.preview, mode, loading: d.loading, loadError: d.loadError });

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={d.dirty && !save.isSuccess}
      size="lg"
      title={TITLE[mode]}
      footer={
        <>
          <ModalCancel />
          <Button variant="accent" loading={save.isPending} disabled={blocked} onClick={() => d.form && save.mutate(toOptions(d.form))}>
            {SUBMIT[mode]}
          </Button>
        </>
      }
    >
      {d.form && d.initial ? (
        <ShipmentBody
          mode={mode}
          form={d.form}
          set={d.set}
          initial={d.initial}
          preview={d.preview ?? d.initial}
          loading={d.loading}
          loadError={d.loadError}
        />
      ) : (
        <Loading error={d.initialError} />
      )}
    </Modal>
  );
}
