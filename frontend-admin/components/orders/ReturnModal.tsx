"use client";

/**
 * Return wizard (POST /orders/{id}/returns, V68) — three steps in one modal:
 *   1. Что вернули   — lines, quantity, and where each unit goes: на склад / брак (списать) /
 *                       осталось у покупателя (компенсация). A rejected order skips this step: its
 *                       parcel is received with «Посылка вернулась», here only money is recorded.
 *   2. Деньги        — how the customer paid (money journal), what goes back to the card through
 *                       monobank, what goes back by hand (a channel is required), what the shop keeps
 *                       (the prepayment that paid for delivery). The totals line is always visible.
 *   3. Подтверждение — a short summary, a comment, «Сообщить покупателю».
 * The old POST …/return is no longer used by the UI.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  MOVEMENT_CHANNEL_LABEL,
  REFUND_CHANNELS,
  type MovementChannel,
} from "@/lib/orders";
import type { AdminOrderDetail, ReturnOutcome, ReturnWizardBody } from "@/lib/orders-api";
import { Modal, ModalCancel } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";

interface LineState {
  qty: number;
  outcome: ReturnOutcome;
}

interface ManualRow {
  key: number;
  channel: MovementChannel | "";
  amount: string;
}

type Step = 1 | 2 | 3;

const OUTCOMES: { value: ReturnOutcome; label: string }[] = [
  { value: "IN_TRANSIT", label: "Едет назад (почтой)" },
  { value: "RESTOCK", label: "На склад" },
  { value: "DEFECT", label: "Брак (списать)" },
  { value: "KEPT", label: "У покупателя (компенсация)" },
];

const OUTCOME_SHORT: Record<ReturnOutcome, string> = {
  IN_TRANSIT: "едет назад — примете, когда придёт",
  RESTOCK: "на склад",
  DEFECT: "брак, списать",
  KEPT: "остаётся у покупателя",
};

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
  const [lines, setLines] = useState<Record<number, LineState>>({});
  const [keptAmount, setKeptAmount] = useState("");
  const [mono, setMono] = useState("");
  const [retain, setRetain] = useState("");
  const [manual, setManual] = useState<ManualRow[]>([]);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  /** Signature of the lines the money defaults were computed for (recomputed when they change). */
  const [computedFor, setComputedFor] = useState("");
  const [rowSeq, setRowSeq] = useState(1);

  const orderId = order?.id ?? null;
  // A delivered order's goods are with the customer: they come back by post (Нова пошта) — «Едет
  // назад» first, shelf or write-off when the parcel arrives. A parcel still on its way out
  // (SHIPPED) or a self-pickup handed back at the counter is taken right here.
  const outcomes = OUTCOMES.filter((o) => o.value !== "IN_TRANSIT" || order?.status === "DELIVERED");
  const firstOutcome: ReturnOutcome =
    order?.status === "DELIVERED" && order.deliveryMethod === "NOVA_POSHTA" ? "IN_TRANSIT" : "RESTOCK";
  // Money only: a rejected order (the parcel is received with «Посылка вернулась») or an overpaid one.
  const moneyOnly =
    !!order && (order.status === "REJECTED" || order.status === "NEW" || order.status === "APPROVED");

  useEffect(() => {
    if (!open) return;
    setStep(moneyOnly ? 2 : 1);
    setLines({});
    setKeptAmount("");
    setMono("");
    setRetain("");
    setManual([]);
    setNote("");
    setNotify(true);
    setComputedFor("");
    // moneyOnly is derived from the order opened, so it follows orderId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const cur = order?.currency ?? "UAH";
  const admin = order?.admin ?? null;
  const received = order ? Math.max(0, order.receivedMinor ?? 0) : 0;
  const returned = order ? Math.max(0, order.refundedMinor ?? 0) : 0;
  const refundable = Math.max(0, received - returned);
  const retainedAlready = admin?.retainedMinor ?? 0;
  const monoLeft = admin?.monoRefundableMinor ?? 0;

  const sig = useMemo(
    () =>
      Object.entries(lines)
        .filter(([, l]) => l.qty > 0)
        .map(([id, l]) => `${id}:${l.qty}:${l.outcome}`)
        .join("|") +
      "#" +
      keptAmount,
    [lines, keptAmount]
  );

  /** Σ qty × unitPaid of RESTOCK / DEFECT lines + the hand-typed compensation for KEPT ones. */
  const suggested = useMemo(() => {
    if (!order) return 0;
    const goods = order.items.reduce((sum, it) => {
      const l = it.id != null ? lines[it.id] : undefined;
      if (!l || l.qty <= 0 || l.outcome === "KEPT") return sum;
      const unit = it.unitPaidMinor ?? (it.gift ? 0 : it.priceMinor);
      return sum + l.qty * unit;
    }, 0);
    return goods + parseMinor(keptAmount);
  }, [order, lines, keptAmount]);

  /** How the customer paid: PAYMENT/CORRECTION rows of the journal by channel. */
  const paidBy = useMemo(() => {
    const by = new Map<MovementChannel, number>();
    for (const m of admin?.movements ?? []) {
      if (m.kind === "PAYMENT" || m.kind === "CORRECTION") {
        by.set(m.channel, (by.get(m.channel) ?? 0) + m.amountMinor);
      }
    }
    return [...by.entries()].filter(([, v]) => v !== 0);
  }, [admin]);

  if (!order) return null;

  const units = Object.values(lines).reduce((s, l) => s + l.qty, 0);
  const hasKept = Object.values(lines).some((l) => l.qty > 0 && l.outcome === "KEPT");
  const hasAutoGift = order.items.some((it) => it.autoGift);

  const monoMinor = parseMinor(mono);
  const retainMinor = parseMinor(retain);
  const manualMinor = manual.reduce((s, r) => s + parseMinor(r.amount), 0);
  const nowMinor = monoMinor + manualMinor;
  const totalOut = nowMinor + retainMinor;
  const shopKeeps = refundable - totalOut;

  const manualNoChannel = manual.some((r) => parseMinor(r.amount) > 0 && !r.channel);
  const overpaidOnly = order.status === "NEW" || order.status === "APPROVED";
  const overpaid = Math.max(0, refundable - order.totalMinor);

  const errors: string[] = [];
  if (totalOut > refundable) {
    errors.push(`Вернуть и удержать вместе можно не больше ${money(refundable, cur)} (получено минус уже возвращено).`);
  }
  if (monoMinor > monoLeft) {
    errors.push(`Через monobank можно вернуть не больше ${money(monoLeft, cur)}.`);
  }
  if (manualNoChannel) errors.push("Выберите способ для каждой строки «Вернуть вручную».");
  if (overpaidOnly && nowMinor > overpaid) {
    errors.push(`До отправки можно вернуть только переплату: ${money(overpaid, cur)}.`);
  }
  const nothing = units === 0 && totalOut === 0;
  const dirty = units > 0 || totalOut > 0 || note.trim() !== "";

  // ---- helpers ----
  function setLine(id: number, patch: Partial<LineState>) {
    setLines((prev) => {
      const c = prev[id] ?? { qty: 0, outcome: firstOutcome };
      return { ...prev, [id]: { ...c, ...patch } };
    });
  }

  /** Default split of `due` (see the table in the header comment of this file). */
  function applyDefaults() {
    const free = Math.max(0, refundable - retainedAlready);
    const due = Math.min(suggested, free);
    let nMono = 0;
    let nRetain = 0;
    let nManual = 0;
    const prepayScheme = order!.prepaymentMinor > 0 && order!.prepaymentMinor < order!.totalMinor;
    if (due > 0) {
      if (prepayScheme) {
        // Prepayment + наложка: the prepayment pays for delivery and stays with the shop; the rest
        // of what is owed goes back by hand (the cash part never went through the bank).
        // A refusal of a shipped parcel already kept the prepayment (RETAINED): never keep it twice.
        nRetain = Math.min(Math.max(0, order!.prepaymentMinor - retainedAlready), due, free);
        nManual = due - nRetain;
      } else {
        nMono = Math.min(monoLeft, due);
        nManual = due - nMono;
      }
    }
    setMono(toInput(nMono));
    setRetain(toInput(nRetain));
    setManual(nManual > 0 ? [{ key: rowSeq, channel: "", amount: toInput(nManual) }] : []);
    setRowSeq((n) => n + 1);
  }

  function next() {
    if (step === 1) {
      if (computedFor !== sig) {
        applyDefaults();
        setComputedFor(sig);
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  function back() {
    if (step === 3) setStep(2);
    else if (step === 2 && !moneyOnly) setStep(1);
  }

  function submit() {
    if (nothing || errors.length > 0) return;
    onSave({
      lines: Object.entries(lines)
        .filter(([, l]) => l.qty > 0)
        .map(([id, l]) => ({ itemId: Number(id), quantity: l.qty, outcome: l.outcome })),
      refunds: manual
        .filter((r) => parseMinor(r.amount) > 0 && r.channel)
        .map((r) => ({ channel: r.channel as MovementChannel, amountMinor: parseMinor(r.amount) })),
      monoRefundMinor: monoMinor,
      retainMinor,
      note: note.trim() || undefined,
      notifyCustomer: notify,
    });
  }

  const firstStep: Step = moneyOnly ? 2 : 1;
  const stepTitle = step === 1 ? "Что вернули" : step === 2 ? "Деньги" : "Подтверждение";
  const stepNo = moneyOnly ? step - 1 : step;
  const stepTotal = moneyOnly ? 2 : 3;

  const nextDisabled = step === 1 ? units === 0 : errors.length > 0 || (moneyOnly && totalOut === 0);

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
            <Button variant="accent" loading={loading} disabled={nothing || errors.length > 0} onClick={submit}>
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
                className={cn("h-1.5 w-6 rounded-full", i < stepNo ? "bg-[var(--accent)]" : "bg-[var(--surface-3)]")}
              />
            ))}
          </div>
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Шаг {stepNo} из {stepTotal} · {stepTitle}
          </span>
        </div>

        {/* ---------------- 1. what came back ---------------- */}
        {step === 1 && (
          <div className="flex flex-col gap-2.5">
            {order.items.map((it, i) => {
              if (it.id == null) return null;
              const left = it.quantity - (it.returnedQty ?? 0);
              if (left <= 0) return null;
              const l = lines[it.id] ?? { qty: 0, outcome: firstOutcome };
              const unit = it.unitPaidMinor ?? (it.gift ? 0 : it.priceMinor);
              return (
                <div key={it.id ?? i} className="card-2 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-[var(--text)]">
                        {it.gift && "🎁 "}
                        {it.title}
                      </div>
                      <div className="text-[12px] text-[var(--text-faint)]">
                        {it.variantName ? `${it.variantName} · ` : ""}
                        {it.gift ? "подарок · 0" : `оплачено ${money(unit, cur)}/шт.`} · можно вернуть {left} из{" "}
                        {it.quantity}
                        {(it.returnedQty ?? 0) > 0 && ` (уже возвращено ${it.returnedQty})`}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StepBtn disabled={l.qty <= 0} onClick={() => setLine(it.id!, { qty: l.qty - 1 })}>
                        −
                      </StepBtn>
                      <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">{l.qty}</span>
                      <StepBtn disabled={l.qty >= left} onClick={() => setLine(it.id!, { qty: l.qty + 1 })}>
                        +
                      </StepBtn>
                    </div>
                  </div>
                  {l.qty > 0 && (
                    <div className={cn("mt-2 grid gap-1", outcomes.length > 3 ? "grid-cols-2" : "grid-cols-3")}>
                      {outcomes.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={l.outcome === o.value}
                          onClick={() => setLine(it.id!, { outcome: o.value })}
                          className={cn(
                            "nb-press min-h-10 rounded-[var(--r-sm)] border px-1.5 py-1.5 text-center text-[11.5px] font-semibold leading-tight transition-colors",
                            l.outcome === o.value
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                              : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--line-strong)]"
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {units > 0 && (
              <p className="text-[12.5px] text-[var(--text-muted)]">
                Вернули {units} шт. Стоимость по оплаченным ценам (с учётом скидки):{" "}
                <b className="tabular text-[var(--text)]">
                  {money(
                    order.items.reduce((s, it) => {
                      const l = it.id != null ? lines[it.id] : undefined;
                      return s + (l && l.outcome !== "KEPT" ? l.qty * (it.unitPaidMinor ?? (it.gift ? 0 : it.priceMinor)) : 0);
                    }, 0),
                    cur
                  )}
                </b>
                .
              </p>
            )}
            {hasKept && (
              <Input
                label={`Компенсация за то, что осталось у покупателя, ${cur}`}
                type="number"
                inputMode="decimal"
                value={keptAmount}
                placeholder="0"
                onChange={(e) => setKeptAmount(e.target.value)}
                hint="Сумма вручную — идёт в «к возврату» на следующем шаге."
              />
            )}
            {hasAutoGift && (
              <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
                В заказе подарок за сумму — он остаётся у покупателя; если нужно, решите в чате.
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
                  ? "Заказ отклонён — товар принимается кнопкой «Посылка вернулась». Здесь можно записать только деньги."
                  : `Заказ ещё не отправлен — можно вернуть только переплату: ${money(overpaid, cur)}.`}
              </p>
            )}

            <div className="card-2 flex flex-col gap-1.5 px-3 py-2.5 text-[12.5px] text-[var(--text-muted)]">
              <div className="field-label">Как платили</div>
              {paidBy.length === 0 ? (
                <span>В журнале денег оплат нет (получено {money(received, cur)}).</span>
              ) : (
                paidBy.map(([ch, v]) => (
                  <div key={ch} className="flex justify-between gap-3">
                    <span>{MOVEMENT_CHANNEL_LABEL[ch]}</span>
                    <b className="tabular text-[var(--text)]">{money(v, cur)}</b>
                  </div>
                ))
              )}
              {retainedAlready > 0 && (
                <div className="flex justify-between gap-3">
                  <span>Уже удержано магазином</span>
                  <b className="tabular text-[var(--text)]">{money(retainedAlready, cur)}</b>
                </div>
              )}
            </div>

            {!moneyOnly && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--text-muted)]">
                <span>
                  К возврату по товарам:{" "}
                  <b className="tabular text-[var(--text)]">{money(Math.min(suggested, Math.max(0, refundable - retainedAlready)), cur)}</b>
                </span>
                <button
                  type="button"
                  onClick={applyDefaults}
                  className="text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline"
                >
                  Пересчитать подсказку
                </button>
              </div>
            )}

            {/* monobank */}
            <div className="flex flex-col gap-1.5">
              <Input
                label={`Вернуть на карту через monobank, ${cur}`}
                type="number"
                inputMode="decimal"
                value={mono}
                placeholder="0"
                disabled={monoLeft <= 0}
                onChange={(e) => setMono(e.target.value)}
                error={monoMinor > monoLeft ? `Не больше ${money(monoLeft, cur)}` : undefined}
                hint={
                  monoLeft > 0
                    ? `Можно вернуть через банк до ${money(monoLeft, cur)}. Банк вернёт деньги после сохранения возврата.`
                    : "По заказу нет платежей monobank, которые можно вернуть."
                }
              />
            </div>

            {/* retained */}
            <Input
              label={`Удержать за доставку, ${cur}`}
              type="number"
              inputMode="decimal"
              value={retain}
              placeholder="0"
              onChange={(e) => setRetain(e.target.value)}
              hint="Предоплата за доставку остаётся у магазина и записывается в журнал как «Удержано»."
            />

            {/* manual */}
            <div className="flex flex-col gap-2">
              <div className="field-label">Вернуть вручную</div>
              {manual.map((r) => (
                <div key={r.key} className="card-2 flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <ChannelSelect
                      value={r.channel}
                      onChange={(v) => setManual((m) => m.map((x) => (x.key === r.key ? { ...x, channel: v } : x)))}
                    />
                    <button
                      type="button"
                      aria-label="Убрать строку"
                      onClick={() => setManual((m) => m.filter((x) => x.key !== r.key))}
                      className="nb-press grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    label={`Сумма, ${cur}`}
                    type="number"
                    inputMode="decimal"
                    value={r.amount}
                    placeholder="0"
                    onChange={(e) => setManual((m) => m.map((x) => (x.key === r.key ? { ...x, amount: e.target.value } : x)))}
                  />
                </div>
              ))}
              <Button
                variant="surface"
                size="sm"
                className="self-start"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setManual((m) => [...m, { key: rowSeq, channel: "", amount: "" }]);
                  setRowSeq((n) => n + 1);
                }}
              >
                Добавить способ
              </Button>
            </div>

            {errors.map((e) => (
              <p key={e} className="text-[12.5px] font-medium text-[var(--danger-ink)]">
                {e}
              </p>
            ))}
          </div>
        )}

        {/* ---------------- 3. confirm ---------------- */}
        {step === 3 && (
          <div className="flex flex-col gap-3">
            <div className="card-2 flex flex-col gap-1.5 px-3 py-2.5 text-[13px]">
              {Object.entries(lines)
                .filter(([, l]) => l.qty > 0)
                .map(([id, l]) => {
                  const it = order.items.find((x) => x.id === Number(id));
                  return (
                    <div key={id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-[var(--text)]">
                        {it?.title ?? "Позиция"} ×{l.qty}
                      </span>
                      <span className="shrink-0 text-[var(--text-muted)]">{OUTCOME_SHORT[l.outcome]}</span>
                    </div>
                  );
                })}
              {units === 0 && <span className="text-[var(--text-muted)]">Только деньги, без товара.</span>}
              {monoMinor > 0 && <SumRow label="На карту через monobank" value={money(monoMinor, cur)} />}
              {manual
                .filter((r) => parseMinor(r.amount) > 0 && r.channel)
                .map((r) => (
                  <SumRow
                    key={r.key}
                    label={`Вручную · ${MOVEMENT_CHANNEL_LABEL[r.channel as MovementChannel]}`}
                    value={money(parseMinor(r.amount), cur)}
                  />
                ))}
              {retainMinor > 0 && <SumRow label="Удерживаем за доставку" value={money(retainMinor, cur)} />}
            </div>
            <Input label="Комментарий (в журнал)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            <Toggle checked={notify} onChange={setNotify} label="Сообщить покупателю" />
            {hasAutoGift && (
              <p className="text-[12.5px] text-[var(--text-muted)]">
                В заказе подарок за сумму — он остаётся у покупателя; если нужно, решите в чате.
              </p>
            )}
          </div>
        )}

        {/* Always visible: where the money stands */}
        <p className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          Получено <b className="tabular text-[var(--text)]">{money(received, cur)}</b> · уже возвращено{" "}
          <b className="tabular text-[var(--text)]">{money(returned, cur)}</b> · вернём сейчас{" "}
          <b className="tabular text-[var(--text)]">{money(nowMinor, cur)}</b> · удержим{" "}
          <b className="tabular text-[var(--text)]">{money(retainMinor, cur)}</b> · останется у магазина{" "}
          <b className={cn("tabular", shopKeeps < 0 ? "text-[var(--danger-ink)]" : "text-[var(--text)]")}>
            {money(shopKeeps, cur)}
          </b>
        </p>
      </div>
    </Modal>
  );
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      <b className="tabular text-[var(--text)]">{value}</b>
    </div>
  );
}

function ChannelSelect({
  value,
  onChange,
}: {
  value: MovementChannel | "";
  onChange: (v: MovementChannel) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as MovementChannel)}
      aria-label="Способ возврата"
      className={cn(
        "h-10 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[14px] outline-none",
        "focus:!border-[var(--accent)] hover:border-[var(--border-2)]",
        value ? "text-[var(--text)]" : "text-[var(--text-faint)]"
      )}
    >
      <option value="" disabled>
        Выберите способ…
      </option>
      {REFUND_CHANNELS.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function StepBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="nb-press grid h-8 w-8 place-items-center rounded-[var(--r-sm)] border border-[var(--border-2)] bg-[var(--surface-2)] text-[16px] font-semibold leading-none text-[var(--text)] transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)] disabled:opacity-40"
    >
      {children}
    </button>
  );
}
