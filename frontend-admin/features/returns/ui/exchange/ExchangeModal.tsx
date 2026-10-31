"use client";

/**
 * Обмен (POST /orders/{id}/exchange, доставленный заказ): покупатель получил посылку, ему что-то не подошло —
 * получает другое. Исходный заказ остаётся «Доставлен» со своей ТТН и чеком; замена уходит новым заказом
 * «Обмен к #…» со своей ТТН.
 *   1. что вернул покупатель и где оно: едет почтой, уже у нас (на склад) или брак (списание);
 *   2. на что меняем — поиск товара, вариант, количество (остаток резервируется);
 *   3. с чего начнётся новый заказ: «Новый» (по умолчанию) или сразу «Одобрен».
 * Деньги: что покупатель заплатил за возвращаемое — идёт в зачёт нового заказа; дороже — доплата, дешевле — возврат.
 */
import { shortOrderId } from "@shop/core/format";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import type { ExchangeBody } from "../../api";
import type { ReturnOrder } from "../../model/types";
import { ExchangeBack } from "./ExchangeBack";
import { ExchangeNew } from "./ExchangeNew";
import { ExchangeSummary } from "./ExchangeSummary";
import { useExchangeDraft } from "./use-exchange-draft";

export function ExchangeModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: ReturnOrder | null;
  onClose: () => void;
  onSave: (body: ExchangeBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const d = useExchangeDraft(open, order, onSave);
  if (!order) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      dirty={d.dirty}
      title="🔄 Обмен"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Toggle checked={d.notify} onChange={d.setNotify} label="Уведомить клиента" />
          <div className="flex gap-2">
            <ModalCancel />
            <Button variant="accent" loading={loading} disabled={!d.ready} onClick={d.submit}>
              Оформить обмен
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-[var(--text-muted)]">
          Этот заказ останется в «Доставлен» со своей ТТН. Замена уйдёт отдельным заказом «Обмен к{" "}
          {shortOrderId(order.id)}» с новой ТТН, а возвращённое покажется в «Едет назад», пока не приедет.
        </p>
        <ExchangeBack d={d} order={order} />
        <ExchangeNew d={d} order={order} />
        <ExchangeSummary d={d} order={order} />
        <Input
          label="Комментарий (в журнал)"
          value={d.note}
          onChange={(e) => d.setNote(e.target.value)}
          maxLength={500}
        />
      </div>
    </Modal>
  );
}
