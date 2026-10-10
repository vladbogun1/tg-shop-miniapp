"use client";

/**
 * DiscountModal — admin applies a discount to an order: an existing promo code
 * OR a manual amount/percent. Live-previews the new total. Warns if the order is
 * already (partially) paid, since a discount then implies an overpayment/refund.
 * The code list offers only «Наши» shared codes plus this customer's own personal ones — not other
 * customers' review bonuses (they used to bury the shop's own codes).
 */
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, Tag, X } from "lucide-react";
import { adminApi, ApiError, type OrderDetailDto } from "@/lib/api";
import { extApi, promoOrigin } from "@/lib/api-extra";
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
    queryFn: () => extApi.promocodes(),
    enabled: open,
  });
  // Exhausted / expired codes would only fail on the server ("лимит исчерпан") — don't offer them.
  // Offered: our shared codes, then this customer's own personal codes (e.g. their review bonus).
  // Other customers' personal codes and review bonuses would be refused anyway («чужой код»).
  const activePromos = useMemo(() => {
    const now = Date.now();
    const usable = promos.filter(
      (p) =>
        p.active &&
        (p.maxUses == null || (p.usesCount ?? 0) < p.maxUses) &&
        !(p.expiresAt && new Date(p.expiresAt).getTime() < now)
    );
    const ours = usable.filter((p) => promoOrigin(p) === "OURS");
    const own = usable.filter((p) => promoOrigin(p) !== "OURS" && p.ownerUserId != null && p.ownerUserId === order?.tgUserId);
    return [...ours, ...own];
  }, [promos, order?.tgUserId]);
  const firstOwn = activePromos.findIndex((p) => promoOrigin(p) !== "OURS");

  const subtotal = order?.subtotalMinor ?? 0;
  const cur = order?.currency ?? "UAH";
  const num = parseFloat(val.replace(",", ".")) || 0;
  // The backend takes a whole percent — preview exactly what will be saved (7,5 → 8).
  const pct = Math.min(Math.round(num), 100);

  const discount = useMemo(() => {
    if (mode === "promo") {
      const p = activePromos.find((x) => x.code === promoCode);
      if (!p) return 0;
      return (p.discountAmountMinor ?? 0) > 0
        ? Math.min(p.discountAmountMinor!, subtotal)
        : Math.floor((subtotal * (p.discountPercent ?? 0)) / 100);
    }
    if (kind === "amount") return Math.min(Math.round(num * 100), subtotal);
    return Math.floor((subtotal * pct) / 100);
  }, [mode, kind, num, pct, promoCode, subtotal, activePromos]);

  const newTotal = Math.max(0, subtotal - discount);
  const canApply =
    (mode === "promo" && !!promoCode) || (mode === "manual" && (kind === "amount" ? num > 0 : pct > 0));

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
            : { percent: pct, notifyCustomer: notify };
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
                      : `−${p.discountPercent ?? 0}%`}
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
              value={val}
              onChange={(e) => setVal(e.target.value)}
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
