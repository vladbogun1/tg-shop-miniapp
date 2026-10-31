"use client";

/**
 * NewOrderModal — a manual order: a sale made outside the site (phone, Instagram, in person).
 * POST /api/admin/orders. Prices, stock, promo code and variants are checked by the backend with the
 * rules of a normal checkout; its 400 message is shown under the form.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { adminApi, ApiError, type Product, type ProductVariant } from "@/lib/api";
import { productApi } from "@/features/product";
import { ordersApi } from "@/lib/orders-api";
import type { MovementChannel } from "@/lib/orders";
import { money, toMinor } from "@/lib/money";
import { refreshInbox } from "@/lib/inbox";
import { toast } from "@shop/ui/toast";
import { cn } from "@/lib/cn";
import { Modal, ModalCancel } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Image } from "@/lib/image";

type Delivery = "NOVA_POSHTA" | "PICKUP";
type PaidChannel = Extract<MovementChannel, "CARD_TRANSFER" | "CASH" | "NP_COD" | "MONO" | "OTHER">;

const DELIVERY_OPTIONS: { value: Delivery; label: string }[] = [
  { value: "NOVA_POSHTA", label: "Нова пошта" },
  { value: "PICKUP", label: "Самовывоз" },
];

const CHANNEL_OPTIONS: { value: PaidChannel; label: string }[] = [
  { value: "CARD_TRANSFER", label: "Перевод на карту" },
  { value: "CASH", label: "Наличные" },
  { value: "NP_COD", label: "Наложка НП" },
  { value: "MONO", label: "monobank" },
  { value: "OTHER", label: "Другое" },
];

interface Line {
  key: string;
  product: Product;
  variant: ProductVariant | null;
  qtyText: string;
}

const qtyOf = (l: Line) => Math.max(0, parseInt(l.qtyText, 10) || 0);

export function NewOrderModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** The created order's id — the page opens it. */
  onCreated: (orderId: string) => void;
}) {
  const qc = useQueryClient();

  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [promo, setPromo] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("NOVA_POSHTA");
  const [city, setCity] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [paidText, setPaidText] = useState("");
  const [channel, setChannel] = useState<PaidChannel>("CARD_TRANSFER");
  const [channelTouched, setChannelTouched] = useState(false);
  const [note, setNote] = useState("");
  const [tgId, setTgId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => productApi.list(),
    enabled: open,
  });
  const { data: payments = [] } = useQuery({
    queryKey: ["payment-options", "active"],
    queryFn: () => adminApi.paymentOptions(),
    enabled: open,
  });
  const paymentOptions = useMemo(
    () => payments.filter((p) => !!p.id).map((p) => ({ value: p.id as string, label: p.title })),
    [payments]
  );

  const found = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return products.filter((p) => !p.archived && p.title.toLowerCase().includes(s)).slice(0, 8);
  }, [products, q]);

  const total = lines.reduce((sum, l) => sum + l.product.priceMinor * qtyOf(l), 0);
  const currency = lines[0]?.product.currency;
  const paidMinor = paidText.trim() ? toMinor(paidText) : 0;
  const tgValid = !tgId.trim() || /^\d{1,18}$/.test(tgId.trim());

  const canSubmit =
    lines.length > 0 &&
    lines.every((l) => qtyOf(l) >= 1) &&
    name.trim().length > 0 &&
    phone.trim().length > 0 &&
    !!paymentId &&
    tgValid &&
    paidMinor >= 0;

  const dirty = lines.length > 0 || !!name || !!phone || !!comment || !!promo || !!note;

  function addLine(product: Product, variant: ProductVariant | null) {
    const key = `${product.id}:${variant?.id ?? ""}`;
    setLines((cur) =>
      cur.some((l) => l.key === key)
        ? cur.map((l) => (l.key === key ? { ...l, qtyText: String(qtyOf(l) + 1) } : l))
        : [...cur, { key, product, variant, qtyText: "1" }]
    );
    setQ("");
  }

  function setQty(key: string, text: string) {
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, qtyText: text.replace(/\D/g, "").slice(0, 4) } : l)));
  }

  function pickDelivery(d: Delivery) {
    setDelivery(d);
    if (!channelTouched) setChannel(d === "PICKUP" ? "CASH" : "CARD_TRANSFER");
  }

  function reset() {
    setLines([]);
    setQ("");
    setName("");
    setPhone("");
    setComment("");
    setPromo("");
    setDelivery("NOVA_POSHTA");
    setCity("");
    setWarehouse("");
    setPaymentId("");
    setPaidText("");
    setChannel("CARD_TRANSFER");
    setChannelTouched(false);
    setNote("");
    setTgId("");
    setError(null);
  }

  async function submit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      const order = await ordersApi.create({
        items: lines.map((l) => ({ productId: l.product.id, variantId: l.variant?.id ?? null, quantity: qtyOf(l) })),
        customerName: name.trim(),
        phone: phone.trim(),
        comment: comment.trim() || undefined,
        promoCode: promo.trim() || undefined,
        deliveryMethod: delivery,
        npCityName: delivery === "NOVA_POSHTA" && city.trim() ? city.trim() : undefined,
        npWarehouseName: delivery === "NOVA_POSHTA" && warehouse.trim() ? warehouse.trim() : undefined,
        paymentOptionId: paymentId,
        tgUserId: tgId.trim() ? Number(tgId.trim()) : undefined,
        paidMinor,
        paidChannel: channel,
        note: note.trim() || undefined,
      });
      toast.success("Заказ создан");
      qc.invalidateQueries({ queryKey: ["board"] });
      qc.invalidateQueries({ queryKey: ["orders-table"] });
      refreshInbox(qc);
      reset();
      onClose();
      onCreated(order.id);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Не удалось создать заказ";
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      dirty={dirty}
      title="Новый заказ"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <ModalCancel disabled={saving} />
          <Button variant="accent" loading={saving} disabled={!canSubmit} onClick={submit}>
            Создать заказ
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="text-[12.5px] leading-snug text-[var(--text-faint)]">
          Продажа вне сайта: по телефону, в Instagram, лично. Цены, склад и промокод проверит сервер.
        </p>

        {/* Items */}
        <section className="flex flex-col gap-2.5">
          <span className="field-label">Товары</span>
          {lines.map((l) => (
            <div key={l.key} className="card-2 flex items-center gap-2.5 p-2">
              <Image
                src={l.product.images?.[0]?.url}
                alt={l.product.title}
                size={96}
                className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
              />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 break-words text-[13.5px] leading-snug font-semibold text-[var(--text)]">
                  {l.product.title}
                  {l.variant && <span className="text-[var(--text-muted)]"> · {l.variant.name}</span>}
                </div>
                <div className="tabular text-[12px] text-[var(--text-faint)]">
                  {money(l.product.priceMinor, l.product.currency)} × {qtyOf(l)} ={" "}
                  {money(l.product.priceMinor * qtyOf(l), l.product.currency)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="Меньше"
                  className="hit flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]"
                  onClick={() => setQty(l.key, String(Math.max(1, qtyOf(l) - 1)))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  inputMode="numeric"
                  aria-label="Количество"
                  value={l.qtyText}
                  onChange={(e) => setQty(l.key, e.target.value)}
                  onBlur={() => qtyOf(l) < 1 && setQty(l.key, "1")}
                  className="tabular h-8 w-10 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-2)] text-center text-[13px] text-[var(--text)]"
                />
                <button
                  type="button"
                  aria-label="Больше"
                  className="hit flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]"
                  onClick={() => setQty(l.key, String(qtyOf(l) + 1))}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Убрать"
                  className="hit flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[var(--danger-ink)] hover:bg-[var(--surface-3)]"
                  onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          <Input
            icon={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти товар по названию…"
          />
          {q.trim() && (
            <div className="thin-scroll flex max-h-64 flex-col gap-1.5 overflow-auto">
              {found.map((p) => {
                const hasVariants = !!p.variants && p.variants.length > 0;
                const eff = hasVariants ? p.variants!.reduce((s, v) => s + (v.stock ?? 0), 0) : p.stock ?? 0;
                return (
                  <div key={p.id} className={cn("card-2 flex flex-col gap-2 p-2", eff <= 0 && "opacity-50")}>
                    <button
                      type="button"
                      disabled={hasVariants}
                      onClick={() => addLine(p, null)}
                      className="flex items-center gap-3 text-left"
                    >
                      <Image
                        src={p.images?.[0]?.url}
                        alt={p.title}
                        size={96}
                        className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                      />
                      <span className="min-w-0 flex-1 line-clamp-2 break-words text-[13.5px] leading-snug font-semibold text-[var(--text)]">
                        {p.title}
                      </span>
                      <span className="tabular shrink-0 text-right text-[12px] text-[var(--text-faint)]">
                        {money(p.priceMinor, p.currency)}
                        <br />
                        {eff} шт
                      </span>
                    </button>
                    {hasVariants && (
                      <div className="flex flex-wrap gap-1.5 pl-[52px]">
                        {p.variants!.map((v) => (
                          <button
                            key={v.id ?? v.name}
                            type="button"
                            onClick={() => addLine(p, v)}
                            className={cn(
                              "nb-chip nb-press h-8 px-3 text-[12.5px] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
                              (v.stock ?? 0) <= 0 && "opacity-50"
                            )}
                          >
                            {v.name} · {v.stock ?? 0}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {found.length === 0 && <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>}
            </div>
          )}
          {lines.length > 0 && (
            <div className="tabular text-right text-[13px] font-semibold text-[var(--text)]">
              Итого по прайсу: {money(total, currency)}
            </div>
          )}
        </section>

        {/* Customer */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Имя покупателя" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <Input
            label="Телефон"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+380…"
            autoComplete="off"
          />
          <Input
            label="Telegram id покупателя (необязательно)"
            inputMode="numeric"
            value={tgId}
            onChange={(e) => setTgId(e.target.value.replace(/\D/g, "").slice(0, 18))}
            placeholder="если он уже писал боту"
          />
          <Input label="Промокод" value={promo} onChange={(e) => setPromo(e.target.value)} autoComplete="off" />
          <div className="sm:col-span-2">
            <Textarea
              label="Комментарий к заказу"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </section>

        {/* Delivery */}
        <section className="flex flex-col gap-3">
          <span className="field-label">Доставка</span>
          <SegmentedControl options={DELIVERY_OPTIONS} value={delivery} onChange={pickDelivery} className="h-10" />
          {delivery === "NOVA_POSHTA" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Город" value={city} onChange={(e) => setCity(e.target.value)} />
              <Input label="Отделение" value={warehouse} onChange={(e) => setWarehouse(e.target.value)} />
            </div>
          )}
        </section>

        {/* Payment */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Select
              label="Способ оплаты"
              value={paymentId}
              options={paymentOptions}
              onChange={setPaymentId}
              placeholder="Выберите способ оплаты…"
            />
          </div>
          <Input
            label="Уже получено, ₴"
            inputMode="decimal"
            value={paidText}
            onChange={(e) => setPaidText(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
            placeholder="0 — ещё не платил"
          />
          <Select
            label="Как получили"
            value={channel}
            options={CHANNEL_OPTIONS}
            onChange={(v) => {
              setChannel(v);
              setChannelTouched(true);
            }}
          />
          <div className="sm:col-span-2">
            <Input label="Заметка (для себя)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </section>

        {error && (
          <p role="alert" className="text-[13px] font-semibold text-[var(--danger-ink)]">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
