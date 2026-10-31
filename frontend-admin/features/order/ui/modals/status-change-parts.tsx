"use client";

import type { OrderStatus } from "@shop/core/types";
import type { ShopForm } from "@shop/ui/form";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { REJECT_REASON_LABEL, STATUS_LABEL, STATUS_VAR, type RejectReasonCode } from "../../model/status";
import { REASONS, heldMoneyKind } from "../../model/status-change";

export type StatusForm = ShopForm<{ ttn: string; reason: string }>;

/** What the modal needs to know about the order it acts on. */
export interface StatusTargetOrder {
  id: string;
  /** "#5bf865c4 · Иван" — shown in the title so the admin sees which order this is. */
  label?: string;
  totalMinor?: number;
  currency?: string;
  /** Units that would go back to stock on REJECTED + restock. */
  restockUnits?: number;
  deliveryMethod?: "NOVA_POSHTA" | "PICKUP" | null;
  /** Current status — a SHIPPED order that is rejected may be a parcel coming back. */
  fromStatus?: OrderStatus;
  /** Money received so far / the prepayment of the order (for the «предоплата удержана» hint). */
  receivedMinor?: number;
  prepaymentMinor?: number;
}

export interface RejectState {
  code: RejectReasonCode | null;
  restock: boolean;
  inTransit: boolean;
}

const NOTE = "rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]";

export function StatusTitle({ target, label }: { target: OrderStatus; label?: string }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: STATUS_VAR[target], boxShadow: `0 0 8px color-mix(in srgb, ${STATUS_VAR[target]} 55%, transparent)` }}
        />
        {STATUS_LABEL[target]}
      </span>
      {label && (
        <span className="min-w-0 truncate text-[13px] font-medium normal-case tracking-normal text-[var(--text-muted)] [font-family:var(--font-body)]">
          {label}
        </span>
      )}
    </span>
  );
}

export function NoOrderNote() {
  return (
    <p className="mb-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-[13px] font-medium text-[var(--danger-ink)]">
      Карточка заказа закрыта — откройте заказ заново.
    </p>
  );
}

export function TtnField({ form, looksWrong, onEnter }: { form: StatusForm; looksWrong: boolean; onEnter: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        label="Номер ТТН (обязательно)"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        placeholder="20450000000000"
        {...form.register("ttn")}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        hint={looksWrong ? undefined : "Нова Пошта: 14 цифр, начинается с 20 или 59. Клиент получит номер в боте."}
        error={looksWrong ? "Не похоже на ТТН Новой Почты (14 цифр, начало 20/59). Проверьте номер." : undefined}
      />
    </div>
  );
}

function ReasonGrid({ code, onPick }: { code: RejectReasonCode | null; onPick: (r: RejectReasonCode) => void }) {
  return (
    <div>
      <div className="field-label mb-1.5">Причина (обязательно)</div>
      <div className="grid grid-cols-2 gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onPick(r)}
            className={cn(
              "nb-press min-h-10 rounded-[var(--r-md)] border px-3 py-2 text-left text-[12.5px] font-medium leading-tight transition-colors",
              code === r
                ? "border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-[var(--danger-ink)]"
                : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)]",
            )}
          >
            {REJECT_REASON_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  );
}

function InTransitCard({ inTransit, onChange }: { inTransit: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="card-2 px-3.5 py-3">
      <Toggle checked={inTransit} onChange={onChange} label="Посылка едет назад — вернуть на склад, когда придёт" />
      <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
        {inTransit
          ? "Товар на склад сейчас не вернётся: заказ получит метку «Едет назад», а когда посылка придёт — кнопка «Посылка вернулась» вернёт товар на склад (брак можно списать)."
          : "Посылка не вернётся (например, потеряна) — склад решается переключателем ниже."}
      </p>
    </div>
  );
}

function HeldMoneyNote({ received, prepay, currency }: { received: number; prepay: number | undefined; currency?: string }) {
  const kind = heldMoneyKind(received, prepay);
  return (
    <p className={NOTE}>
      {kind === "held" && (
        <>
          Предоплата <b className="tabular text-[var(--text)]">{money(received, currency)}</b> останется у магазина — это оплата доставки
          (запишется в журнал денег как «Удержано: доставка»).
        </>
      )}
      {kind === "over" && <>Получено больше предоплаты — автоматически ничего не удерживается. Деньги вернёте через «Возврат».</>}
      {kind === "unknown" && (
        <>Если по заказу была предоплата, она останется у магазина (оплата доставки). Остальное вернёте через «Возврат».</>
      )}
    </p>
  );
}

function RestockCard({ restock, units, onChange }: { restock: boolean; units?: number; onChange: (v: boolean) => void }) {
  return (
    <div className="card-2 px-3.5 py-3">
      <Toggle
        checked={restock}
        onChange={onChange}
        label={units != null ? `Вернуть товары на склад (${units} шт.)` : "Вернуть товары на склад"}
      />
      <p className="mt-1.5 text-[12px] text-[var(--text-muted)]">
        Возвращается всё количество по всем позициям заказа. Выключите, если товар вернулся не в товарном виде. Частичный возврат — кнопка
        «Возврат» в карточке заказа.
      </p>
    </div>
  );
}

export function ReasonFields({
  form,
  order,
  state,
  shippedReject,
  onPick,
  onRestock,
  onInTransit,
}: {
  form: StatusForm;
  order: StatusTargetOrder | null;
  state: RejectState;
  shippedReject: boolean;
  onPick: (r: RejectReasonCode) => void;
  onRestock: (v: boolean) => void;
  onInTransit: (v: boolean) => void;
}) {
  const received = order?.receivedMinor ?? 0;
  const showHeld = shippedReject && received > 0;
  return (
    <div className="flex flex-col gap-3">
      <ReasonGrid code={state.code} onPick={onPick} />
      <Textarea
        label={state.code === "OTHER" ? "Пояснение (обязательно)" : "Пояснение (по желанию)"}
        rows={2}
        {...form.register("reason")}
        hint="Текст увидит клиент в уведомлении об отклонении."
      />
      {shippedReject && <InTransitCard inTransit={state.inTransit} onChange={onInTransit} />}
      {showHeld && <HeldMoneyNote received={received} prepay={order?.prepaymentMinor} currency={order?.currency} />}
      {!(shippedReject && state.inTransit) && <RestockCard restock={state.restock} units={order?.restockUnits} onChange={onRestock} />}
    </div>
  );
}

export function DeliveredNote({ order }: { order: StatusTargetOrder | null }) {
  return (
    <p className="text-[14px] text-[var(--text-muted)]">
      Заказ будет отмечен доставленным и <b className="text-[var(--text)]">полностью оплаченным</b>
      {order?.totalMinor != null && <> (получено {money(order.totalMinor, order.currency)})</>}. Клиент получит уведомление. Отменить потом
      можно только через «Отклонить».
    </p>
  );
}

export function PlainConfirm({ target }: { target: OrderStatus }) {
  return <p className="text-[14px] text-[var(--text-muted)]">Перевести заказ в статус «{STATUS_LABEL[target]}»?</p>;
}
