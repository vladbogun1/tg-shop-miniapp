"use client";

/**
 * Return wizard (POST /orders/{id}/returns, V68) — written to need no explanation:
 *   1. Что возвращают — where the goods are now (on their way by post / already here / staying
 *      with the customer; a shipped parcel: refused at the branch, partial pickup — V72), which lines (a «Вернуть» switch, a counter for several units), брак for
 *      goods already here, and — when the order has a gift — a separate question: take it back too
 *      or leave it with the customer.
 *   2. Деньги — what the customer paid for the returned goods (the sale price, discount included)
 *      is suggested as is; the shop keeps nothing back. Paid in full through monobank → refunded
 *      automatically by the bank (or from the admin's own money if they prefer); anything else
 *      (prepayment + наложка, cash) → from the admin's own money, just recorded in the journal.
 *   3. Проверьте — pictures of what comes back, what happens to the gift, the money, a comment.
 * A rejected order (its parcel is received with «Посылка вернулась») or an overpaid one that has
 * not shipped skips step 1: only money.
 */
import { useEffect, useState } from "react";
import {
  Banknote,
  CreditCard,
  Gift,
  Home,
  PackageCheck,
  Truck,
  Wallet,
} from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type {
  AdminOrderDetail,
  ReturnOutcome,
  ReturnWizardBody,
} from "@/lib/orders-api";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";

type Item = AdminOrderDetail["items"][number];
type Step = 1 | 2 | 3;
/** Where the returned goods are right now. */
type Where = "POST" | "HERE" | "KEPT";
type GiftChoice = "TAKE" | "LEAVE";

/** "12,5" / "12.5" → minor units (0 for anything unreadable or negative). */
function parseMinor(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function toInput(minor: number): string {
  return minor > 0 ? String(minor / 100) : "";
}

export function ReturnModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  onSave: (body: ReturnWizardBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const [step, setStep] = useState<Step>(1);
  const [where, setWhere] = useState<Where>("HERE");
  /** itemId → units returned (paid lines only; each gift follows its own choice). */
  const [picked, setPicked] = useState<Record<number, number>>({});
  /** itemId → of them, broken (only when the goods are already here). */
  const [defect, setDefect] = useState<Record<number, number>>({});
  /** gift itemId → take it back or leave it with the customer (asked per gift: a gift for the sum and a case prize may differ). */
  const [giftChoice, setGiftChoice] = useState<Record<number, GiftChoice>>({});
  const [amount, setAmount] = useState("");
  /** The amount was typed by hand — keep it when going back and forth. */
  const [amountTouched, setAmountTouched] = useState(false);
  const [viaMono, setViaMono] = useState(true);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);

  const orderId = order?.id ?? null;
  const delivered = order?.status === "DELIVERED";
  /** The parcel is at the branch: the customer takes part of it, the refused rest comes back (V72). */
  const shipped = order?.status === "SHIPPED";
  // Money only: a rejected order (the parcel is received with «Посылка вернулась») or an overpaid one.
  const moneyOnly =
    !!order &&
    (order.status === "REJECTED" ||
      order.status === "NEW" ||
      order.status === "APPROVED");

  useEffect(() => {
    if (!open) return;
    setStep(moneyOnly ? 2 : 1);
    // A delivered parcel (or the part refused at the branch) comes back by post; a self-pickup is here.
    setWhere(
      (delivered || shipped) && order?.deliveryMethod === "NOVA_POSHTA"
        ? "POST"
        : "HERE",
    );
    setPicked({});
    setDefect({});
    setGiftChoice({});
    setAmount("");
    setAmountTouched(false);
    setViaMono(true);
    setNote("");
    setNotify(true);
    // moneyOnly / delivered are derived from the order opened, so they follow orderId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const cur = order?.currency ?? "UAH";
  const admin = order?.admin ?? null;
  const received = order ? Math.max(0, order.receivedMinor ?? 0) : 0;
  const returnedMoney = order ? Math.max(0, order.refundedMinor ?? 0) : 0;
  const retainedAlready = admin?.retainedMinor ?? 0;
  /** What can still go back: received − refunded − what a refusal already kept for delivery. */
  const cap = Math.max(0, received - returnedMoney - retainedAlready);
  const monoLeft = admin?.monoRefundableMinor ?? 0;
  const overpaid = order
    ? Math.max(0, received - returnedMoney - order.totalMinor)
    : 0;

  const left = (it: Item) =>
    it.quantity - (it.returnedQty ?? 0) - (it.returnPendingQty ?? 0);
  const unitPaid = (it: Item) =>
    it.unitPaidMinor ?? (it.gift ? 0 : it.priceMinor);
  const paidLines = (order?.items ?? []).filter(
    (it) => it.id != null && !it.gift && left(it) > 0,
  );
  const giftLines = (order?.items ?? []).filter(
    (it) => it.id != null && it.gift && left(it) > 0,
  );

  const units = Object.values(picked).reduce((s, n) => s + n, 0);
  const allPaidBack =
    paidLines.length > 0 &&
    paidLines.every((it) => (picked[it.id!] ?? 0) >= left(it));
  const askGift =
    !moneyOnly && where !== "KEPT" && units > 0 && giftLines.length > 0;

  /** What the customer paid for the returned units — the suggestion, never reduced by anything. */
  const goodsValue = (order?.items ?? []).reduce(
    (s, it) => s + (it.id != null ? (picked[it.id] ?? 0) * unitPaid(it) : 0),
    0,
  );
  /**
   * Partial pickup: the refused goods come off наложка, so only what was paid above the price of
   * the goods the customer keeps goes back (a prepaid-in-full order: the refused part).
   */
  const pickup = !moneyOnly && shipped && where !== "KEPT";
  const collectable = order
    ? Math.max(0, order.totalMinor - Math.max(0, order.uncollectedMinor ?? 0))
    : 0;
  const collectableAfter = Math.max(0, collectable - goodsValue);
  const pickupOver = Math.max(0, received - returnedMoney - collectableAfter);
  const codBefore = Math.max(0, collectable - received);
  const codAfter = Math.max(0, collectableAfter - received);
  const suggested = pickup
    ? Math.min(pickupOver, cap)
    : moneyOnly
    ? order?.status === "REJECTED"
      ? cap
      : Math.min(overpaid, cap)
    : where === "KEPT"
      ? 0
      : Math.min(goodsValue, cap);

  if (!order) return null;

  const amountMinor = parseMinor(amount);
  const prepayScheme =
    order.prepaymentMinor > 0 && order.prepaymentMinor < order.totalMinor;
  // The bank can only give back what went through it; prepayment + наложка → own money.
  const monoPossible = !prepayScheme && monoLeft > 0 && amountMinor <= monoLeft;
  const useMono = monoPossible && viaMono;
  const limit =
    order.status === "NEW" || order.status === "APPROVED"
      ? Math.min(overpaid, cap)
      : pickup
        ? Math.min(pickupOver, cap)
        : cap;

  const errors: string[] = [];
  if (amountMinor > limit)
    errors.push(`Вернуть можно не больше ${money(limit, cur)}.`);
  // Goods stay with the customer → a compensation is the whole point; «Далее» waits for the amount.
  const needsCompensation = !moneyOnly && where === "KEPT" && amountMinor === 0;

  // Nothing taken at the branch is a refused parcel: «Отклонить» with «Посылка едет назад».
  const refusedAll = pickup && allPaidBack;

  const nextDisabled =
    step === 1
      ? units === 0 ||
        refusedAll || (askGift && giftLines.some((g) => !giftChoice[g.id!]))
      : errors.length > 0 || needsCompensation || (moneyOnly && amountMinor === 0);
  const nothing = units === 0 && amountMinor === 0;
  const dirty = units > 0 || amountMinor > 0 || note.trim() !== "";

  function setPick(it: Item, n: number) {
    const v = Math.max(0, Math.min(left(it), n));
    setPicked((p) => ({ ...p, [it.id!]: v }));
    setDefect((p) => ({ ...p, [it.id!]: Math.min(p[it.id!] ?? 0, v) }));
  }

  function setBroken(it: Item, n: number) {
    const max = picked[it.id!] ?? 0;
    setDefect((p) => ({ ...p, [it.id!]: Math.max(0, Math.min(max, n)) }));
  }

  function next() {
    if (step === 1) {
      if (!amountTouched) setAmount(toInput(suggested));
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  function back() {
    if (step === 3) setStep(2);
    else if (step === 2 && !moneyOnly) setStep(1);
  }

  function buildLines(): ReturnWizardBody["lines"] {
    const out: ReturnWizardBody["lines"] = [];
    const push = (it: Item, qty: number, outcome: ReturnOutcome) => {
      if (qty > 0) out.push({ itemId: it.id!, quantity: qty, outcome });
    };
    for (const it of paidLines) {
      const q = picked[it.id!] ?? 0;
      if (q <= 0) continue;
      if (where === "POST") push(it, q, "IN_TRANSIT");
      else if (where === "KEPT") push(it, q, "KEPT");
      else {
        const d = Math.min(defect[it.id!] ?? 0, q);
        push(it, q - d, "RESTOCK");
        push(it, d, "DEFECT");
      }
    }
    if (askGift) {
      for (const g of giftLines) {
        if (giftChoice[g.id!] === "TAKE")
          push(g, left(g), where === "POST" ? "IN_TRANSIT" : "RESTOCK");
      }
    }
    return out;
  }

  function submit() {
    if (nothing || needsCompensation || errors.length > 0) return;
    onSave({
      lines: buildLines(),
      refunds:
        !useMono && amountMinor > 0
          ? [
              {
                channel: "CARD_TRANSFER",
                amountMinor,
                note: "с личных средств",
              },
            ]
          : [],
      monoRefundMinor: useMono ? amountMinor : 0,
      retainMinor: 0,
      note: note.trim() || undefined,
      notifyCustomer: notify,
    });
  }

  const firstStep: Step = moneyOnly ? 2 : 1;
  const stepTitle =
    step === 1
      ? "Что возвращают"
      : step === 2
        ? "Деньги"
        : "Проверьте и подтвердите";
  const stepNo = moneyOnly ? step - 1 : step;
  const stepTotal = moneyOnly ? 2 : 3;

  const whereOptions: {
    value: Where;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }[] = [
    ...(delivered
      ? [
          {
            value: "POST" as Where,
            label: "Едет к нам почтой",
            hint: "Покупатель отправит посылку. Когда придёт — нажмёте «Посылка вернулась».",
            icon: <Truck className="h-4 w-4" />,
          },
        ]
      : shipped
        ? [
            {
              value: "POST" as Where,
              label: "Не забрал на почте — едет назад",
              hint: "Покупатель забрал не всё. Отказанное едет к нам, наложка уменьшится на его стоимость. Когда придёт — нажмёте «Посылка вернулась».",
              icon: <Truck className="h-4 w-4" />,
            },
          ]
        : []),
    {
      value: "HERE",
      label: "Уже у нас",
      hint: "Товар у вас в руках — сразу вернётся на склад (или в брак).",
      icon: <Home className="h-4 w-4" />,
    },
    {
      value: "KEPT",
      label: "Остаётся у покупателя",
      hint: "Товар не возвращают — только часть денег (компенсация).",
      icon: <Wallet className="h-4 w-4" />,
    },
  ];

  const outcomeText = (d: number, q: number) =>
    where === "POST"
      ? "едет к нам"
      : where === "KEPT"
        ? "остаётся у покупателя"
        : d >= q
          ? "брак — спишется"
          : d > 0
            ? `на склад ${q - d}, брак ${d}`
            : "на склад";

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      dirty={dirty}
      title="↩️ Возврат"
      footer={
        <>
          {step === firstStep ? (
            <ModalCancel />
          ) : (
            <Button variant="ghost" onClick={back} disabled={loading}>
              Назад
            </Button>
          )}
          {step < 3 ? (
            <Button variant="accent" disabled={nextDisabled} onClick={next}>
              Далее
            </Button>
          ) : (
            <Button
              variant="accent"
              loading={loading}
              disabled={nothing || needsCompensation || errors.length > 0}
              onClick={submit}
            >
              Оформить возврат
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: stepTotal }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-6 rounded-full",
                  i < stepNo ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]",
                )}
              />
            ))}
          </div>
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Шаг {stepNo} из {stepTotal} · {stepTitle}
          </span>
        </div>

        {/* ---------------- 1. what comes back ---------------- */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <div className="field-label">Где сейчас товар?</div>
              <div
                className={cn(
                  "grid gap-2",
                  whereOptions.length === 3
                    ? "sm:grid-cols-3"
                    : "sm:grid-cols-2",
                )}
              >
                {whereOptions.map((o) => (
                  <ChoiceCard
                    key={o.value}
                    active={where === o.value}
                    onClick={() => setWhere(o.value)}
                    icon={o.icon}
                    label={o.label}
                  />
                ))}
              </div>
              <p className="text-[12px] text-[var(--text-faint)]">
                {whereOptions.find((o) => o.value === where)?.hint}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <div className="field-label">
                {where === "KEPT"
                  ? "За какой товар компенсация?"
                  : "Что возвращают?"}
              </div>
              {paidLines.length === 0 && (
                <p className="text-[13px] text-[var(--text-muted)]">
                  Все позиции уже возвращены или едут назад.
                </p>
              )}
              {paidLines.map((it) => {
                const max = left(it);
                const q = picked[it.id!] ?? 0;
                const d = defect[it.id!] ?? 0;
                return (
                  <div
                    key={it.id}
                    className={cn(
                      "card-2 flex flex-col gap-2 px-3 py-2.5 transition-colors",
                      q > 0 &&
                        "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Thumb item={it} dim={q === 0} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                          {it.title}
                        </div>
                        <div className="text-[12px] text-[var(--text-faint)]">
                          {it.variantName ? `${it.variantName} · ` : ""}
                          {money(unitPaid(it), cur)}/шт. · в заказе {max} шт.
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Toggle
                          checked={q > 0}
                          onChange={(on) => setPick(it, on ? max : 0)}
                          label="Вернуть"
                        />
                      </div>
                    </div>
                    {q > 0 && max > 1 && (
                      <Counter
                        label="Сколько штук"
                        value={q}
                        min={1}
                        max={max}
                        onChange={(n) => setPick(it, n)}
                      />
                    )}
                    {q > 0 && where === "HERE" && (
                      <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[12.5px] text-[var(--text-muted)]">
                            {d > 0
                              ? `Брак — ${d} шт. спишется`
                              : "Пришло целым — вернётся на склад"}
                          </span>
                          <Toggle
                            checked={d > 0}
                            onChange={(on) =>
                              setBroken(it, on ? (q > 1 ? 1 : q) : 0)
                            }
                            label="Брак"
                          />
                        </div>
                        {d > 0 && q > 1 && (
                          <Counter
                            label="Сколько бракованных"
                            value={d}
                            min={1}
                            max={q}
                            onChange={(n) => setBroken(it, n)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            {askGift && (
              <section className="flex flex-col gap-2">
                <div className="field-label">
                  {giftLines.length > 1
                    ? "Подарки в этом заказе — что с ними?"
                    : "Подарок в этом заказе — что с ним?"}
                </div>
                <p className="text-[12.5px] text-[var(--text-muted)]">
                  {allPaidBack
                    ? "Покупатель возвращает весь оплаченный товар."
                    : "Покупатель возвращает часть заказа — подарок мог быть за сумму, которой теперь нет."}{" "}
                  Решите сами{giftLines.length > 1 ? " по каждому" : ""}:
                </p>
                {giftLines.map((g) => {
                  const c = giftChoice[g.id!];
                  const choose = (v: GiftChoice) =>
                    setGiftChoice((p) => ({ ...p, [g.id!]: v }));
                  return (
                    <div
                      key={g.id}
                      className={cn(
                        "card-2 flex flex-col gap-2 px-3 py-2.5",
                        !c &&
                          "border-[color-mix(in_srgb,var(--warn)_45%,transparent)]",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Thumb item={g} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                            🎁 {g.title}
                          </div>
                          <div className="text-[12px] text-[var(--text-faint)]">
                            {g.variantName ? `${g.variantName} · ` : ""}подарок
                            · {left(g)} шт.
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <ChoiceCard
                          active={c === "TAKE"}
                          onClick={() => choose("TAKE")}
                          icon={<PackageCheck className="h-4 w-4" />}
                          label={
                            where === "POST"
                              ? "Забрать — пусть вернёт вместе"
                              : "Забрать — вернулся вместе"
                          }
                        />
                        <ChoiceCard
                          active={c === "LEAVE"}
                          onClick={() => choose("LEAVE")}
                          icon={<Gift className="h-4 w-4" />}
                          label="Оставить покупателю"
                        />
                      </div>
                    </div>
                  );
                })}
                {giftLines.some((g) => !giftChoice[g.id!]) && (
                  <p className="text-[12px] text-[var(--warn)]">
                    Выберите, чтобы продолжить.
                  </p>
                )}
              </section>
            )}

            {refusedAll && (
              <p className="text-[12.5px] font-medium text-[var(--warn)]">
                Покупатель не забирает ничего — это отказ от посылки:
                отклоните заказ с «Посылка едет назад».
              </p>
            )}
            {units > 0 && pickup && !refusedAll && (
              <p className="text-[12.5px] text-[var(--text-muted)]">
                Не выкуплено на{" "}
                <b className="tabular text-[var(--text)]">
                  {money(goodsValue, cur)}
                </b>{" "}
                — наложка станет{" "}
                <b className="tabular text-[var(--text)]">
                  {money(codAfter, cur)}
                </b>{" "}
                вместо {money(codBefore, cur)}.
              </p>
            )}
            {units > 0 && where !== "KEPT" && !pickup && (
              <p className="text-[12.5px] text-[var(--text-muted)]">
                Покупатель заплатил за это{" "}
                <b className="tabular text-[var(--text)]">
                  {money(goodsValue, cur)}
                </b>{" "}
                (по цене продажи, со скидкой).
              </p>
            )}
          </div>
        )}

        {/* ---------------- 2. money ---------------- */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            {moneyOnly && (
              <p className="text-[13px] text-[var(--text-muted)]">
                {order.status === "REJECTED"
                  ? "Заказ отклонён — товар принимается кнопкой «Посылка вернулась». Здесь — только деньги."
                  : `Заказ ещё не отправлен — вернуть можно только переплату: ${money(overpaid, cur)}.`}
              </p>
            )}
            {pickup && (
              <div className="card-2 flex flex-col gap-1.5 px-3 py-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)]">
                    Не выкуплено — снимется с наложки
                  </span>
                  <b className="tabular text-[15px] text-[var(--text)]">
                    {money(goodsValue, cur)}
                  </b>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)]">Наложка станет</span>
                  <b className="tabular text-[15px] text-[var(--text)]">
                    {money(codAfter, cur)}
                  </b>
                </div>
              </div>
            )}
            {!moneyOnly && where !== "KEPT" && !pickup && (
              <div className="card-2 flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                <span className="text-[var(--text-muted)]">
                  Заплатил за возвращённое
                </span>
                <b className="tabular text-[15px] text-[var(--text)]">
                  {money(Math.min(goodsValue, cap), cur)}
                </b>
              </div>
            )}

            <Input
              label={
                where === "KEPT" && !moneyOnly
                  ? `Компенсация, ${cur}`
                  : `Сколько вернуть, ${cur}`
              }
              type="number"
              inputMode="decimal"
              value={amount}
              placeholder="0"
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountTouched(true);
              }}
              hint={
                where === "KEPT" && !moneyOnly
                  ? "Сколько денег отдаёте покупателю, раз товар остаётся у него."
                  : pickup && suggested === 0
                    ? "За невыкупленное покупатель не платил — оно просто не войдёт в наложку. Возвращать нечего."
                    : pickup
                      ? `Покупатель заплатил заранее больше, чем стоит то, что он забрал: к возврату ${money(suggested, cur)}.`
                      : amountMinor === suggested
                    ? "Подставили полную сумму. Можно уменьшить, если договорились иначе; 0 — без возврата денег."
                    : `Полная сумма — ${money(suggested, cur)}. 0 — без возврата денег.`
              }
            />

            {amountMinor > 0 && (
              <section className="flex flex-col gap-2">
                <div className="field-label">Как вернуть</div>
                {monoPossible ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ChoiceCard
                      active={viaMono}
                      onClick={() => setViaMono(true)}
                      icon={<CreditCard className="h-4 w-4" />}
                      label="Автоматически через monobank"
                      sub="Банк вернёт на карту, с которой платили"
                    />
                    <ChoiceCard
                      active={!viaMono}
                      onClick={() => setViaMono(false)}
                      icon={<Banknote className="h-4 w-4" />}
                      label="С личных средств"
                      sub="Переведёте сами, мы только запишем"
                    />
                  </div>
                ) : (
                  <div className="card-2 flex items-start gap-2.5 px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
                    <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-hi)]" />
                    <span>
                      <b className="text-[var(--text)]">С личных средств.</b>{" "}
                      {prepayScheme
                        ? "Покупатель платил предоплатой и наложкой — через банк такое не вернуть. "
                        : monoLeft > 0
                          ? `Через monobank можно вернуть только до ${money(monoLeft, cur)}. `
                          : "Оплата была не через monobank. "}
                      Переведите покупателю {money(amountMinor, cur)} сами — мы
                      запишем это в журнал.
                    </span>
                  </div>
                )}
              </section>
            )}

            {errors.map((e) => (
              <p
                key={e}
                className="text-[12.5px] font-medium text-[var(--danger-ink)]"
              >
                {e}
              </p>
            ))}
          </div>
        )}

        {/* ---------------- 3. confirm ---------------- */}
        {step === 3 && (
          <div className="flex flex-col gap-3">
            {units > 0 && (
              <div className="flex flex-col gap-1.5">
                {paidLines
                  .filter((it) => (picked[it.id!] ?? 0) > 0)
                  .map((it) => {
                    const q = picked[it.id!] ?? 0;
                    const d =
                      where === "HERE" ? Math.min(defect[it.id!] ?? 0, q) : 0;
                    return (
                      <SummaryRow
                        key={it.id}
                        item={it}
                        qty={q}
                        text={outcomeText(d, q)}
                        danger={d > 0}
                      />
                    );
                  })}
                {askGift &&
                  giftLines.map((g) => (
                    <SummaryRow
                      key={g.id}
                      item={g}
                      qty={left(g)}
                      gift
                      text={
                        giftChoice[g.id!] === "TAKE"
                          ? where === "POST"
                            ? "забираем — едет к нам"
                            : "забираем — на склад"
                          : "остаётся у покупателя"
                      }
                    />
                  ))}
              </div>
            )}
            <div className="card-2 flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
              <span className="text-[var(--text-muted)]">
                {amountMinor === 0
                  ? "Деньги не возвращаем"
                  : useMono
                    ? "Вернём автоматически через monobank"
                    : "Вернёте с личных средств"}
              </span>
              {amountMinor > 0 && (
                <b className="tabular text-[15px] text-[var(--text)]">
                  {money(amountMinor, cur)}
                </b>
              )}
            </div>
            {pickup && units > 0 && (
              <div className="card-2 flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
                <span className="text-[var(--text-muted)]">
                  Наложка: {money(codBefore, cur)} →
                </span>
                <b className="tabular text-[15px] text-[var(--text)]">
                  {money(codAfter, cur)}
                </b>
              </div>
            )}
            {where === "POST" && units > 0 && (
              <p className="text-[12.5px] text-[var(--text-muted)]">
                Заказ появится в колонке «Едет назад». Когда посылка придёт —
                откройте его и нажмите «Посылка вернулась».
              </p>
            )}
            <Input
              label="Комментарий (в журнал)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
            <Toggle
              checked={notify}
              onChange={setNotify}
              label="Сообщить покупателю в Telegram"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

function Thumb({ item, dim }: { item: Item; dim?: boolean }) {
  return (
    <Image
      src={item.imageUrl ?? undefined}
      alt={item.title}
      size={96}
      className={cn(
        "h-12 w-12 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] transition-opacity",
        dim && "opacity-50",
      )}
    />
  );
}

function SummaryRow({
  item,
  qty,
  text,
  gift,
  danger,
}: {
  item: Item;
  qty: number;
  text: string;
  gift?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="card-2 flex items-center gap-3 px-3 py-2">
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[var(--text)]">
          {gift && "🎁 "}
          {item.title}{" "}
          <span className="tabular text-[var(--text-muted)]">×{qty}</span>
        </div>
        <div
          className={cn(
            "text-[12px]",
            danger ? "text-[var(--danger-ink)]" : "text-[var(--text-faint)]",
          )}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

export function ChoiceCard({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "nb-press flex min-h-12 items-center gap-2.5 rounded-[var(--r-md)] border px-3 py-2 text-left transition-colors",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold leading-tight">
          {label}
        </span>
        {sub && (
          <span className="mt-0.5 block text-[11.5px] leading-tight opacity-80">
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

export function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 text-[12.5px] text-[var(--text-muted)]">
      <span>{label}:</span>
      <StepBtn
        label={`${label}: меньше`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </StepBtn>
      <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">
        {value}
      </span>
      <StepBtn
        label={`${label}: больше`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </StepBtn>
      <span>из {max}</span>
    </div>
  );
}

function StepBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
