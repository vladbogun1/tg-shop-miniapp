"use client";

/**
 * DiscountModal — admin applies a discount to an order: an existing promo code
 * OR a manual amount/percent. Live-previews the new total. Warns if the order is
 * already (partially) paid, since a discount then implies an overpayment/refund.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, Tag, X } from "lucide-react";
import { adminApi, ApiError, type OrderDetailDto } from "@/lib/api";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";

type Mode = "promo" | "manual";
type Kind = "amount" | "percent";

export function DiscountModal({
  open,
  order,
  onClose,
  onDone,
}: {
  open: boolean;
  order: OrderDetailDto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [mode, setMode] = useState<Mode>("promo");
  const [promoCode, setPromoCode] = useState<string>("");
  const [kind, setKind] = useState<Kind>("amount");
  const [val, setVal] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: promos = [] } = useQuery({
    queryKey: ["promocodes"],
    queryFn: () => adminApi.promocodes(),
    enabled: open,
  });
  const activePromos = promos.filter((p) => p.active);

  const subtotal = order?.subtotalMinor ?? 0;
  const cur = order?.currency ?? "UAH";
  const num = parseFloat(val.replace(",", ".")) || 0;

  const discount = useMemo(() => {
    if (mode === "promo") {
      const p = activePromos.find((x) => x.code === promoCode);
      if (!p) return 0;
      return (p.discountAmountMinor ?? 0) > 0
        ? Math.min(p.discountAmountMinor!, subtotal)
        : Math.floor((subtotal * (p.discountPercent ?? 0)) / 100);
    }
    if (kind === "amount") return Math.min(Math.round(num * 100), subtotal);
    return Math.floor((subtotal * Math.min(num, 100)) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, kind, num, promoCode, subtotal, activePromos]);

  const newTotal = Math.max(0, subtotal - discount);
  const canApply =
    (mode === "promo" && !!promoCode) || (mode === "manual" && num > 0);

  async function apply(clear = false) {
    if (!order) return;
    setSaving(true);
    try {
      const body = clear
        ? { clear: true, notifyCustomer: false }
        : mode === "promo"
          ? { promoCode, notifyCustomer: notify }
          : kind === "amount"
            ? { amountMinor: Math.round(num * 100), notifyCustomer: notify }
            : { percent: Math.round(num), notifyCustomer: notify };
      await adminApi.applyOrderDiscount(order.id, body);
      push(clear ? "Скидка снята" : "Скидка применена", "ok");
      onDone();
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось применить скидку", "error");
    } finally {
      setSaving(false);
    }
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
          <div className="rounded-[var(--r-sm)] border-2 border-[var(--warn)] bg-[var(--surface-2)] p-2.5 text-[12px] font-semibold text-[var(--text)]">
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
              <p className="text-[13px] text-[var(--text-faint)]">Нет активных промокодов.</p>
            )}
            {activePromos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPromoCode(p.code)}
                className={cn(
                  "flex items-center justify-between rounded-[var(--r-sm)] border-2 px-3 py-2 text-left transition-colors",
                  promoCode === p.code
                    ? "border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "border-[var(--border-2)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]"
                )}
              >
                <span className="font-mono font-extrabold uppercase">{p.code}</span>
                <span className="text-[13px] font-bold">
                  {(p.discountAmountMinor ?? 0) > 0
                    ? `−${money(p.discountAmountMinor!, cur)}`
                    : `−${p.discountPercent ?? 0}%`}
                </span>
              </button>
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
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder="0"
            />
          </div>
        )}

        {/* preview */}
        <div className="space-y-1 rounded-[var(--r-sm)] border-2 border-[var(--border-2)] bg-[var(--surface-2)] p-3 text-[13px]">
          <Row label="Сумма товаров" value={money(subtotal, cur)} />
          <Row label="Скидка" value={`−${money(discount, cur)}`} accent />
          <div className="flex justify-between pt-1 text-[15px] font-black text-[var(--text)]">
            <span>Итого</span>
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
        "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r-sm)] border-2 px-3 py-2 text-[13px] font-bold uppercase tracking-wide transition-colors",
        active
          ? "border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[3px_3px_0_var(--shadow)]"
          : "border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)]"
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
