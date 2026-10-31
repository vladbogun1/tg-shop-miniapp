"use client";

/**
 * StatusChangeModal — asks for what a transition needs before it is applied:
 *  - SHIPPED   → tracking number (ТТН, required; Nova Poshta format is checked as a hint)
 *  - REJECTED  → reason from the fixed list (+ optional text; required for "Другое") and restock;
 *                of a SHIPPED order also «посылка едет назад» (stock returns with «Посылка вернулась»)
 *  - DELIVERED → an explicit confirmation: it also marks the order fully paid and notifies the customer
 *
 * The form belongs to ONE order: every open resets it (a ТТН typed for order A and cancelled used
 * to pre-fill order B), and it is cleared only after the server accepted the change — a failed
 * request keeps what was typed. Without an order the confirm button is disabled and says why.
 */
import { useEffect, useState } from "react";
import type { OrderStatus } from "@/lib/api";
import { BACK_REASONS, buildStatusPayload, cleanTtn, isStatusInvalid, ttnLooksWrong } from "../../model/status-change";
import type { RejectReasonCode } from "../../model/status";
import type { StatusChangeBody } from "../../api";
import { useForm } from "@shop/ui/form";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import {
  DeliveredNote,
  NoOrderNote,
  PlainConfirm,
  ReasonFields,
  StatusTitle,
  TtnField,
  type RejectState,
  type StatusForm,
  type StatusTargetOrder,
} from "./status-change-parts";

export type StatusChangePayload = StatusChangeBody;
export type { StatusTargetOrder };

interface Props {
  open: boolean;
  target: OrderStatus | null;
  order: StatusTargetOrder | null;
  onClose: () => void;
  /** Resolves true when the server accepted the change (the modal is then closed by the caller). */
  onConfirm: (payload: StatusChangePayload) => Promise<boolean> | boolean | void;
  loading?: boolean;
  /** «Посылка едет назад» ticked from the start (a card dropped on «Едет назад»). */
  initialInTransit?: boolean;
}

/** The part of the window that depends on the transition: ТТН, reason + restock, confirmation text. */
function StatusBody(props: {
  target: OrderStatus;
  order: StatusTargetOrder | null;
  form: StatusForm;
  ttnWrong: boolean;
  shippedReject: boolean;
  state: RejectState;
  onPick: (r: RejectReasonCode) => void;
  onRestock: (v: boolean) => void;
  onInTransit: (v: boolean) => void;
  onEnter: () => void;
}) {
  const { target, order, form } = props;
  return (
    <>
      {!order && <NoOrderNote />}
      {target === "SHIPPED" && <TtnField form={form} looksWrong={props.ttnWrong} onEnter={props.onEnter} />}
      {target === "REJECTED" && (
        <ReasonFields
          form={form}
          order={order}
          state={props.state}
          shippedReject={props.shippedReject}
          onPick={props.onPick}
          onRestock={props.onRestock}
          onInTransit={props.onInTransit}
        />
      )}
      {target === "DELIVERED" && <DeliveredNote order={order} />}
      {target !== "SHIPPED" && target !== "REJECTED" && target !== "DELIVERED" && <PlainConfirm target={target} />}
    </>
  );
}

export function StatusChangeModal({ open, target, order, onClose, onConfirm, loading, initialInTransit }: Props) {
  const form = useForm<{ ttn: string; reason: string }>({ defaultValues: { ttn: "", reason: "" } });
  const { reset } = form;
  const { ttn, reason } = form.watch();
  const [code, setCode] = useState<RejectReasonCode | null>(null);
  const [restock, setRestock] = useState(true);
  const [inTransit, setInTransit] = useState(false);

  // A fresh form for every open, target and order.
  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open) return;
    reset({ ttn: "", reason: "" });
    setCode(null);
    setRestock(true);
    setInTransit(!!initialInTransit);
  }, [open, target, orderId, initialInTransit, reset]);

  if (!target) return null;
  const needsTtn = target === "SHIPPED";
  const needsReason = target === "REJECTED";
  const shippedReject = needsReason && order?.fromStatus === "SHIPPED";

  const ttnClean = cleanTtn(ttn);
  const invalid = isStatusInvalid({ hasOrder: !!order, needsTtn, ttnClean, needsReason, code, reason });
  const dirty = !!ttn.trim() || !!reason.trim() || code !== null;

  async function submit() {
    if (!target || invalid) return;
    await onConfirm(buildStatusPayload({ target, ttnClean, code, reason, restock, inTransit, shippedReject }));
    // Nothing is cleared here: on success the caller closes the modal (the next open resets the
    // form), on failure the admin keeps what they typed.
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={dirty}
      size="sm"
      title={<StatusTitle target={target} label={order?.label} />}
      footer={
        <>
          <ModalCancel />
          <Button variant={needsReason ? "danger" : "accent"} loading={loading} onClick={submit} disabled={invalid}>
            {!order ? "Заказ не выбран" : "Подтвердить"}
          </Button>
        </>
      }
    >
      <StatusBody
        target={target}
        order={order}
        form={form}
        ttnWrong={ttnLooksWrong(needsTtn, ttnClean)}
        shippedReject={shippedReject}
        state={{ code, restock, inTransit }}
        onPick={(r) => {
          setCode(r);
          if (shippedReject) setInTransit(BACK_REASONS.includes(r));
        }}
        onRestock={setRestock}
        onInTransit={setInTransit}
        onEnter={submit}
      />
    </Modal>
  );
}
