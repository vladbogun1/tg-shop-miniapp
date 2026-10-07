"use client";

/**
 * StatusChangeModal — asks for what a transition needs before it is applied:
 *  - SHIPPED   → tracking number (ТТН, required; Nova Poshta format is checked as a hint)
 *  - REJECTED  → reason from the fixed list (+ optional text; required for "Другое") and restock
 *  - DELIVERED → an explicit confirmation: it also marks the order fully paid and notifies the customer
 *
 * The form belongs to ONE order: every open resets it (a ТТН typed for order A and cancelled used
 * to pre-fill order B), and it is cleared only after the server accepted the change — a failed
 * request keeps what was typed. Without an order the confirm button is disabled and says why.
 */
import { useEffect, useState } from "react";
import type { OrderStatus } from "@/lib/api";
import {
  isNovaPoshtaTtn,
  REJECT_REASON_LABEL,
  STATUS_VAR,
  STATUS_LABEL,
  type RejectReasonCode,
} from "@/lib/orders";
import type { StatusChangeBody } from "@/lib/orders-api";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";

export type StatusChangePayload = StatusChangeBody;

/** What the modal needs to know about the order it acts on. */
export interface StatusTargetOrder {
  id: string;
  /** "#5bf865c4 · Иван" — shown in the title so the admin sees which order this is. */
  label?: string;
  totalMinor?: number;
  currency?: string;
  /** Units that would go back to stock on REJECTED + restock. */
  restockUnits?: number;
  deliveryMethod?: "NOVA_POSHTA" | "PICKUP";
}

interface Props {
  open: boolean;
  target: OrderStatus | null;
  order: StatusTargetOrder | null;
  onClose: () => void;
  /** Resolves true when the server accepted the change (the modal is then closed by the caller). */
  onConfirm: (payload: StatusChangePayload) => Promise<boolean> | boolean | void;
  loading?: boolean;
}

/** PAYMENT_TIMEOUT is set by the server only (not paid online within 24 h) — never offered here. */
const SYSTEM_REASONS: RejectReasonCode[] = ["PAYMENT_TIMEOUT"];
const REASONS = (Object.keys(REJECT_REASON_LABEL) as RejectReasonCode[]).filter((r) => !SYSTEM_REASONS.includes(r));

export function StatusChangeModal({ open, target, order, onClose, onConfirm, loading }: Props) {
  const [ttn, setTtn] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState<RejectReasonCode | null>(null);
  const [restock, setRestock] = useState(true);

  // A fresh form for every open, target and order.
  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setTtn("");
    setReason("");
    setCode(null);
    setRestock(true);
  }, [open, target, orderId]);

  if (!target) return null;
  const needsTtn = target === "SHIPPED";
  const needsReason = target === "REJECTED";
  const isDelivered = target === "DELIVERED";

  const ttnClean = ttn.replace(/\s+/g, "");
  const ttnLooksWrong = needsTtn && ttnClean.length > 0 && !isNovaPoshtaTtn(ttnClean);
  const reasonMissing = needsReason && (!code || (code === "OTHER" && !reason.trim()));
  const invalid = !order || (needsTtn && !ttnClean) || reasonMissing;
  const dirty = !!ttn.trim() || !!reason.trim() || code !== null;

  async function submit() {
    if (!target || invalid) return;
    await onConfirm({
      status: target,
      trackingNumber: needsTtn ? ttnClean : undefined,
      rejectReasonCode: needsReason && code ? code : undefined,
      rejectReason: needsReason && reason.trim() ? reason.trim() : undefined,
      restock: needsReason ? restock : undefined,
    });
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
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: STATUS_VAR[target], boxShadow: `0 0 8px color-mix(in srgb, ${STATUS_VAR[target]} 55%, transparent)` }}
            />
            {STATUS_LABEL[target]}
          </span>
          {order?.label && (
            <span className="min-w-0 truncate text-[13px] font-medium normal-case tracking-normal text-[var(--text-muted)] [font-family:var(--font-body)]">
              {order.label}
            </span>
          )}
        </span>
      }
      footer={
        <>
          <ModalCancel />
          <Button
            variant={needsReason ? "danger" : "accent"}
            loading={loading}
            onClick={submit}
            disabled={invalid}
          >
            {!order ? "Заказ не выбран" : "Подтвердить"}
          </Button>
        </>
      }
    >
      {!order && (
        <p className="mb-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-[13px] font-medium text-[var(--danger-ink)]">
          Карточка заказа закрыта — откройте заказ заново.
        </p>
      )}

      {needsTtn && (
        <div className="flex flex-col gap-2">
          <Input
            label="Номер ТТН (обязательно)"
            value={ttn}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="20450000000000"
            onChange={(e) => setTtn(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            hint={
              ttnLooksWrong
                ? undefined
                : "Нова Пошта: 14 цифр, начинается с 20 или 59. Клиент получит номер в боте."
            }
            error={ttnLooksWrong ? "Не похоже на ТТН Новой Почты (14 цифр, начало 20/59). Проверьте номер." : undefined}
          />
        </div>
      )}

      {needsReason && (
        <div className="flex flex-col gap-3">
          <div>
            <div className="field-label mb-1.5">
              Причина (обязательно)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCode(r)}
                  className={cn(
                    "nb-press min-h-10 rounded-[var(--r-md)] border px-3 py-2 text-left text-[12.5px] font-medium leading-tight transition-colors",
                    code === r
                      ? "border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-[var(--danger-ink)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)]"
                  )}
                >
                  {REJECT_REASON_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label={code === "OTHER" ? "Пояснение (обязательно)" : "Пояснение (по желанию)"}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            hint="Текст увидит клиент в уведомлении об отклонении."
          />
          <div className="card-2 px-3.5 py-3">
            <Toggle
              checked={restock}
              onChange={setRestock}
              label={
                order?.restockUnits != null
                  ? `Вернуть товары на склад (${order.restockUnits} шт.)`
                  : "Вернуть товары на склад"
              }
            />
            <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
              Возвращается всё количество по всем позициям заказа. Выключите, если товар вернулся не в
              товарном виде. Частичный возврат — кнопка «Возврат» в карточке заказа.
            </p>
          </div>
        </div>
      )}

      {isDelivered && (
        <p className="text-[14px] text-[var(--text-muted)]">
          Заказ будет отмечен доставленным и <b className="text-[var(--text)]">полностью оплаченным</b>
          {order?.totalMinor != null && (
            <>
              {" "}
              (получено {money(order.totalMinor, order.currency)})
            </>
          )}
          . Клиент получит уведомление. Отменить потом можно только через «Отклонить».
        </p>
      )}

      {!needsTtn && !needsReason && !isDelivered && (
        <p className="text-[14px] text-[var(--text-muted)]">
          Перевести заказ в статус «{STATUS_LABEL[target]}»?
        </p>
      )}
    </Modal>
  );
}
