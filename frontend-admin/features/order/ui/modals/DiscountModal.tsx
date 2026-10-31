"use client";

/**
 * DiscountModal — admin applies a discount to an order: an existing promo code
 * OR a manual amount/percent. Live-previews the new total. Warns if the order is
 * already (partially) paid, since a discount then implies an overpayment/refund.
 * The code list offers only «Наши» shared codes plus this customer's own personal ones — not other
 * customers' review bonuses (they used to bury the shop's own codes).
 */
import { Fragment, useMemo, useState } from "react";
import { Percent, Tag, X } from "lucide-react";
import type { AdminOrderDetail } from "../../api";
import { promoOrigin, usePromocodes } from "@/features/promo";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { useForm } from "@shop/ui/form";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { nowMs } from "@shop/core/time";
import {
  canApplyDiscount,
  manualDiscountMinor,
  minorFromInput,
  parseNumberInput,
  promoDiscountMinor,
  usablePromos,
  wholePercent,
  type DiscountKind,
  type DiscountMode,
} from "../../model/discount";
import { useApplyDiscountMutation } from "../../queries/modals";

export function DiscountModal({
  open,
  order,
  onClose,
  onDone,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<DiscountMode>("promo");
  const [promoCode, setPromoCode] = useState<string>("");
  const [kind, setKind] = useState<DiscountKind>("amount");
  const form = useForm<{ val: string }>({ defaultValues: { val: "" } });
  const val = form.watch("val");
  const [notify, setNotify] = useState(true);

  const { data: promos = [] } = usePromocodes(open);
  const activePromos = useMemo(() => usablePromos(promos, order?.tgUserId, nowMs()), [promos, order?.tgUserId]);
  const firstOwn = activePromos.findIndex((p) => promoOrigin(p) !== "OURS");

  const subtotal = order?.subtotalMinor ?? 0;
  const cur = order?.currency ?? "UAH";
  const num = parseNumberInput(val);
  const pct = wholePercent(num);

  const discount = useMemo(() => {
    if (mode === "promo") {
      const p = activePromos.find((x) => x.code === promoCode);
      return p ? promoDiscountMinor(p, subtotal) : 0;
    }
    return manualDiscountMinor(kind, num, pct, subtotal);
  }, [mode, kind, num, pct, promoCode, subtotal, activePromos]);

  const newTotal = Math.max(0, subtotal - discount);
  const canApply = canApplyDiscount(mode, kind, promoCode, num, pct);

  const applyMut = useApplyDiscountMutation(order?.id, () => {
    onDone();
    onClose();
  });
  const saving = applyMut.isPending;

  function apply(clear = false) {
    if (!order) return;
    const body = clear
      ? { clear: true, notifyCustomer: false }
      : mode === "promo"
        ? { promoCode, notifyCustomer: notify }
        : kind === "amount"
          ? { amountMinor: minorFromInput(num), notifyCustomer: notify }
          : { percent: pct, notifyCustomer: notify };
    applyMut.mutate({ body, clear });
  }

  if (!order) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="🏷 Скидка на заказ"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {order.discountMinor > 0 ? (
            <Button variant="ghost" onClick={() => apply(true)} disabled={saving} icon={<X className="h-4 w-4" />}>
              Снять скидку
            </Button>
          ) : (
            <span />
          )}
          <Button variant="accent" loading={saving} disabled={!canApply} onClick={() => apply(false)}>
            Применить · итог {money(newTotal, cur)}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {order.receivedMinor > 0 && (
          <div className="flex items-start gap-2 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2.5 text-[12.5px] font-medium text-[var(--text)]">
            ⚠ По заказу уже получено {money(order.receivedMinor, cur)} — скидка сделает сумму ниже
            оплаченной (переплата/возврат).
          </div>
        )}

        {/* mode switch */}
        <div className="flex gap-2">
          <ModeBtn active={mode === "promo"} onClick={() => setMode("promo")} icon={<Tag className="h-4 w-4" />}>
            Промокод
          </ModeBtn>
          <ModeBtn active={mode === "manual"} onClick={() => setMode("manual")} icon={<Percent className="h-4 w-4" />}>
            Ручная
          </ModeBtn>
        </div>

        {mode === "promo" ? (
          <div className="thin-scroll flex max-h-56 flex-col gap-1.5 overflow-auto">
            {activePromos.length === 0 && (
              <p className="text-[13px] text-[var(--text-faint)]">
                Нет действующих промокодов магазина. Создайте код на странице «Промокоды» или дайте ручную скидку.
              </p>
            )}
            {activePromos.map((p, i) => (
              <Fragment key={p.id}>
                {i === firstOwn && (
                  <span className="field-label mt-1.5">Личные коды этого клиента</span>
                )}
                <button
                  type="button"
                  onClick={() => setPromoCode(p.code)}
                  className={cn(
                    "flex shrink-0 items-center justify-between rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors",
                    promoCode === p.code
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--line-strong)]"
                  )}
                >
                  <span className="font-display font-bold uppercase tracking-[0.04em]">{p.code}</span>
                  <span className="tabular text-[13px] font-semibold">
                    {(p.discountAmountMinor ?? 0) > 0
                      ? `−${money(p.discountAmountMinor!, cur)}`
                      : `−${p.discountPercent ?? 0}%${(p.maxDiscountMinor ?? 0) > 0 ? ` до ${money(p.maxDiscountMinor!, cur)}` : ""}`}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <ModeBtn active={kind === "amount"} onClick={() => setKind("amount")}>
                Сумма ₴
              </ModeBtn>
              <ModeBtn active={kind === "percent"} onClick={() => setKind("percent")}>
                Процент %
              </ModeBtn>
            </div>
            <Input
              label={kind === "amount" ? `Скидка, ${cur}` : "Скидка, %"}
              inputMode="decimal"
              {...form.register("val")}
              placeholder="0"
            />
          </div>
        )}

        {/* preview */}
        <div className="card-2 tabular space-y-1 px-3.5 py-3 text-[13px]">
          <Row label="Сумма товаров" value={money(subtotal, cur)} />
          <Row label="Скидка" value={`−${money(discount, cur)}`} accent={discount > 0} />
          <div className="font-display flex items-baseline justify-between border-t border-[var(--line)] pt-1.5 text-[15px] font-bold text-[var(--ink)]">
            <span className="text-[13px] uppercase tracking-[0.06em]">Итого</span>
            <span>{money(newTotal, cur)}</span>
          </div>
        </div>

        <Toggle checked={notify} onChange={setNotify} label="Уведомить клиента" />
      </div>
    </Modal>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-display nb-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--r-md)] border px-3 text-[12.5px] font-semibold uppercase tracking-[0.06em] transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn("flex justify-between", accent ? "font-semibold text-[var(--ok)]" : "text-[var(--text-muted)]")}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
