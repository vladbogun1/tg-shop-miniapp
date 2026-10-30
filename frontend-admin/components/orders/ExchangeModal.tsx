"use client";

/**
 * Exchange (POST /orders/{id}/exchange, delivered orders): the customer got the parcel, did not like
 * something and gets other goods instead. The delivered order stays in «Доставлен» with its ТТН and
 * receipt; the replacement goes out as a NEW order linked to it («Обмен к #…»), with its own ТТН.
 *   1. what the customer gives back and where it is: on its way by post («Едет назад», accepted
 *      later with «Посылка вернулась»), already here and back on the shelf, or broken (written off);
 *   2. what goes out instead — product search, variant, quantity (stock is reserved);
 *   3. where the new order starts: «Новый» (default) or straight «Одобрен».
 * Money: what the returned units were paid for counts towards the new order («зачёт»); a dearer
 * replacement leaves the difference to pay, a cheaper one leaves the rest to refund here.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { adminApi, type Product, type ProductVariant } from "@/lib/api";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { AdminOrderDetail, ExchangeBody, ExchangeOutcome } from "@/lib/orders-api";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Image } from "@/lib/image";

interface BackLine {
  qty: number;
  outcome: ExchangeOutcome;
}

interface NewLine {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  qty: number;
}

export function ExchangeModal({
  open,
  order,
  onClose,
  onSave,
  loading,
}: {
  open: boolean;
  order: AdminOrderDetail | null;
  onClose: () => void;
  onSave: (body: ExchangeBody) => Promise<unknown> | void;
  loading?: boolean;
}) {
  const [back, setBack] = useState<Record<number, BackLine>>({});
  const [lines, setLines] = useState<NewLine[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [target, setTarget] = useState<"NEW" | "APPROVED">("NEW");
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");

  const orderId = order?.id ?? null;
  useEffect(() => {
    if (!open) return;
    setBack({});
    setLines([]);
    setQ("");
    setPicked(null);
    setTarget("NEW");
    setNotify(true);
    setNote("");
  }, [open, orderId]);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => adminApi.products(),
    enabled: open,
  });

  // Units already taken by the lines on the list — the stock left for one more pick.
  const takenBy = (productId: string, variantId?: string | null) =>
    lines
      .filter((l) => l.product.id === productId && (l.variant?.id ?? null) === (variantId ?? null))
      .reduce((s, l) => s + l.qty, 0);
  const stockOf = (p: Product, v: ProductVariant | null) =>
    (v ? v.stock ?? 0 : p.variants?.length ? p.variants.reduce((s, x) => s + (x.stock ?? 0), 0) : p.stock ?? 0) -
    takenBy(p.id, v?.id);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      // The replacement is a regular order: products hidden from the shop cannot go into it.
      .filter((p) => !p.archived && p.active !== false)
      .filter((p) => (s ? p.title.toLowerCase().includes(s) : true))
      .slice(0, 40);
  }, [products, q]);

  // What the returned units were paid for (after the order's discount) — the server's credit.
  const backValue = useMemo(() => {
    if (!order) return 0;
    return order.items.reduce((sum, it) => {
      const l = it.id != null ? back[it.id] : undefined;
      return sum + (l ? l.qty * (it.gift ? 0 : it.unitPaidMinor ?? it.priceMinor) : 0);
    }, 0);
  }, [order, back]);
  const newValue = lines.reduce((s, l) => s + l.product.priceMinor * l.qty, 0);

  if (!order) return null;
  const cur = order.currency;
  const backUnits = Object.values(back).reduce((s, l) => s + l.qty, 0);
  const newUnits = lines.reduce((s, l) => s + l.qty, 0);
  const ready = backUnits > 0 && newUnits > 0;
  const dirty = backUnits > 0 || lines.length > 0 || note.trim() !== "";

  // Estimate (the server recomputes): the credit is capped by what was paid and not refunded yet.
  const kept = Math.max(0, (order.receivedMinor ?? 0) - (order.refundedMinor ?? 0));
  const credit = Math.min(backValue, kept, newValue);
  const due = newValue - credit;
  const over = Math.min(backValue, kept) - credit;
  // By post the unit travels back on its own; picked up in person it is usually here already.
  const defaultOutcome: ExchangeOutcome = order.deliveryMethod === "NOVA_POSHTA" ? "IN_TRANSIT" : "RESTOCK";

  function setBackLine(id: number, patch: Partial<BackLine>) {
    setBack((prev) => {
      const c = prev[id] ?? { qty: 0, outcome: defaultOutcome };
      return { ...prev, [id]: { ...c, ...patch } };
    });
  }

  function addLine(p: Product, v: ProductVariant | null) {
    if (stockOf(p, v) <= 0) return;
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id && (l.variant?.id ?? null) === (v?.id ?? null));
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key: `${p.id}:${v?.id ?? ""}`, product: p, variant: v, qty: 1 }];
    });
    setPicked(null);
    setQ("");
  }

  function pick(p: Product) {
    if (p.variants?.length) setPicked(p);
    else addLine(p, null);
  }

  function submit() {
    if (!ready) return;
    onSave({
      returned: Object.entries(back)
        .filter(([, l]) => l.qty > 0)
        .map(([id, l]) => ({ itemId: Number(id), quantity: l.qty, outcome: l.outcome })),
      items: lines.map((l) => ({ productId: l.product.id, variantId: l.variant?.id ?? undefined, quantity: l.qty })),
      targetStatus: target,
      notifyCustomer: notify,
      note: note.trim() || undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      dirty={dirty}
      title="🔄 Обмен"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Toggle checked={notify} onChange={setNotify} label="Уведомить клиента" />
          <div className="flex gap-2">
            <ModalCancel />
            <Button variant="accent" loading={loading} disabled={!ready} onClick={submit}>
              Оформить обмен
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-[var(--text-muted)]">
          Этот заказ останется в «Доставлен» со своей ТТН. Замена уйдёт отдельным заказом «Обмен к #
          {order.id.slice(0, 8)}» с новой ТТН, а возвращённое покажется в «Едет назад», пока не приедет.
        </p>

        {/* 1. What came back */}
        <div className="flex flex-col gap-2.5">
          <div className="field-label">1. Что вернул покупатель</div>
          {order.items.map((it, i) => {
            if (it.id == null) return null;
            const left = it.quantity - (it.returnedQty ?? 0);
            if (left <= 0) return null;
            const l = back[it.id] ?? { qty: 0, outcome: defaultOutcome };
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
                      {money(it.unitPaidMinor ?? it.priceMinor, cur)} · в заказе {left} шт.
                    </div>
                  </div>
                  <Stepper
                    value={l.qty}
                    min={0}
                    max={left}
                    onChange={(n) => setBackLine(it.id!, { qty: n })}
                  />
                </div>
                {l.qty > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    <SegmentedControl
                      options={[
                        { value: "IN_TRANSIT", label: "Едет назад" },
                        { value: "RESTOCK", label: "Уже у нас — на склад" },
                        { value: "DEFECT", label: "Брак" },
                      ]}
                      value={l.outcome}
                      onChange={(v) => setBackLine(it.id!, { outcome: v as ExchangeOutcome })}
                    />
                    <span className="text-[12px] text-[var(--text-faint)]">
                      {l.outcome === "IN_TRANSIT"
                        ? "Покупатель отправит посылкой — заказ появится в «Едет назад»; когда приедет, нажмёте «Посылка вернулась»."
                        : l.outcome === "RESTOCK"
                          ? `Товар уже у вас — +${l.qty} шт. на склад сразу.`
                          : "Товар не в продажном виде — будет списан (попадёт в «Списания»), на склад не вернётся."}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 2. What goes out instead */}
        <div className="flex flex-col gap-2.5">
          <div className="field-label">2. На что меняем</div>
          {lines.map((l) => {
            const max = l.qty + stockOf(l.product, l.variant);
            return (
              <div key={l.key} className="card-2 flex items-center gap-3 px-3 py-2">
                <Image
                  src={l.product.images?.[0]?.url}
                  alt={l.product.title}
                  size={96}
                  className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 break-words text-[13.5px] leading-snug font-semibold text-[var(--text)]">{l.product.title}</div>
                  <div className="text-[12px] text-[var(--text-faint)]">
                    {l.variant ? `${l.variant.name} · ` : ""}
                    {money(l.product.priceMinor, cur)} × {l.qty} = {money(l.product.priceMinor * l.qty, cur)}
                  </div>
                </div>
                <Stepper
                  value={l.qty}
                  min={1}
                  max={max}
                  onChange={(n) => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, qty: n } : x)))}
                />
                <button
                  type="button"
                  aria-label="Убрать"
                  onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  className="hit grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:text-[var(--danger-ink)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          {picked ? (
            <div className="card-2 flex flex-col gap-2.5 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13.5px] font-semibold text-[var(--text)]">{picked.title} — вариант:</span>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="font-display hit shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline"
                >
                  Другой товар
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {picked.variants!.map((v) => {
                  const left = stockOf(picked, v);
                  return (
                    <button
                      key={v.id ?? v.name}
                      type="button"
                      disabled={left <= 0}
                      onClick={() => addLine(picked, v)}
                      className={cn(
                        "nb-chip nb-press h-8 px-3.5 text-[12.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]",
                        left <= 0 && "opacity-40"
                      )}
                    >
                      {v.name} · {Math.max(0, left)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <Input
                label={lines.length ? "Добавить ещё товар" : "Поиск товара на замену"}
                icon={<Search className="h-4 w-4" />}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Название…"
              />
              <div className="thin-scroll flex max-h-60 flex-col gap-1.5 overflow-auto">
                {filtered.map((p) => {
                  const left = stockOf(p, null);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pick(p)}
                      disabled={left <= 0}
                      className={cn(
                        "card-2 flex shrink-0 items-center gap-3 p-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
                        left <= 0 && "opacity-40"
                      )}
                    >
                      <Image
                        src={p.images?.[0]?.url}
                        alt={p.title}
                        size={96}
                        className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                      />
                      <span className="min-w-0 flex-1 line-clamp-2 break-words text-[14px] leading-snug font-semibold text-[var(--text)]">{p.title}</span>
                      <span className="tabular shrink-0 text-[12.5px] font-semibold text-[var(--text-muted)]">
                        {money(p.priceMinor, p.currency)}
                      </span>
                      <span className="tabular w-12 shrink-0 pr-1 text-right text-[12px] font-medium text-[var(--text-faint)]">
                        {Math.max(0, left)} шт
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>}
              </div>
            </>
          )}
        </div>

        {/* 3. Money + where the order goes */}
        {ready && (
          <div className="card-2 flex flex-col gap-1.5 px-3.5 py-3 text-[13px]">
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">Новый заказ</span>
              <span className="tabular font-semibold text-[var(--text)]">{money(newValue, cur)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">Зачёт за возвращённое</span>
              <span className="tabular font-semibold text-[var(--text)]">{money(credit, cur)}</span>
            </div>
            {due > 0 && (
              <p className="font-semibold text-[var(--accent-hi)]">
                Доплата {money(due, cur)} — покупатель выберет сам: онлайн в новом заказе через monobank (кнопка
                «Доплатить» у него в заказе) или наложкой при получении.
              </p>
            )}
            {over > 0 && (
              <p className="font-semibold text-[var(--accent-hi)]">
                Останется вернуть {money(over, cur)} — кнопка «Возврат» в этом заказе (или через monobank).
              </p>
            )}
            {due <= 0 && over <= 0 && <p className="text-[var(--text-muted)]">Без доплаты и возврата.</p>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="field-label">3. С чего начнётся новый заказ</div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["NEW", "В «Новые»"],
                ["APPROVED", "Сразу «Одобрен» (к отправке)"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTarget(v)}
                className={cn(
                  "nb-chip nb-press h-9 px-3.5 text-[12.5px] transition-colors",
                  target === v
                    ? "nb-chip-active"
                    : "text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-[var(--text-faint)]">
            Адрес и получатель — как в этом заказе; ТТН впишете при отправке нового.
          </p>
        </div>

        <Input label="Комментарий (в журнал)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <StepBtn disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </StepBtn>
      <span className="tabular w-6 text-center text-[14px] font-semibold text-[var(--text)]">{value}</span>
      <StepBtn disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </StepBtn>
    </div>
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
