"use client";

/**
 * ItemPicker — admin picks a product (and variant, if any) to ADD to an order:
 * a normal paid line, or a free gift (toggle). Stock is reserved server-side so the
 * unit can't be sold to someone else. Used to edit an order's composition (add/replace).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Plus, Search, TriangleAlert } from "lucide-react";
import { adminApi, ApiError, type Product, type ProductVariant } from "@/lib/api";
import { giftApi, type GiftLimit } from "@/lib/gift";
import { money } from "@/lib/money";
import { toast } from "@shop/ui/toast";
import { cn } from "@/lib/cn";
import { Modal } from "@shop/ui/overlay";
import { Button } from "@shop/ui/admin-button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";

export function ItemPicker({
  open,
  orderId,
  defaultGift = false,
  onClose,
  onDone,
}: {
  open: boolean;
  orderId: string | null;
  defaultGift?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  // Text, not a number: "Math.max(1, …)" turned an erased field back into "1", so typing "3" gave "13".
  const [qtyText, setQtyText] = useState("1");
  const qty = Math.max(0, parseInt(qtyText, 10) || 0);
  const setQty = (n: number) => setQtyText(String(n));
  const [gift, setGift] = useState(defaultGift);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => adminApi.products(),
    enabled: open,
  });

  // The tax-free gift limit of this order's customer (gift.monthlyLimitUah): warned about, never blocked.
  const { data: giftLimit } = useQuery({
    queryKey: ["gift-limit", orderId],
    queryFn: () => giftApi.limit(orderId!),
    enabled: open && gift && !!orderId,
    staleTime: 0,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => !p.archived)
      .filter((p) => (s ? p.title.toLowerCase().includes(s) : true))
      .slice(0, 40);
  }, [products, q]);

  const hasVariants = !!selected?.variants && selected.variants.length > 0;
  const available = hasVariants ? variant?.stock ?? 0 : selected?.stock ?? 0;
  const canAdd = !!selected && (!hasVariants || !!variant) && qty >= 1 && qty <= available;

  function reset() {
    setSelected(null);
    setVariant(null);
    setQty(1);
    setGift(defaultGift);
    setQ("");
  }

  async function add() {
    if (!orderId || !selected || !canAdd) return;
    setSaving(true);
    try {
      await adminApi.addOrderItem(orderId, {
        productId: selected.id,
        variantId: variant?.id,
        quantity: qty,
        gift,
        notifyCustomer: notify,
      });
      toast.success(gift ? "Подарок добавлен 🎁" : "Товар добавлен в заказ");
      reset();
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось добавить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="md"
      closeOnBackdrop={false}
      dirty={!!selected}
      title="Добавить в заказ"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Toggle checked={notify} onChange={setNotify} label="Уведомить клиента" />
          <Button
            variant="accent"
            loading={saving}
            disabled={!canAdd}
            icon={gift ? <Gift className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            onClick={add}
          >
            {gift ? "Добавить подарок" : "Добавить товар"}
          </Button>
        </div>
      }
    >
      {gift && giftLimit && (
        <GiftLimitNote limit={giftLimit} addMinor={selected ? selected.priceMinor * Math.max(qty, 1) : 0} />
      )}
      {!selected ? (
        <div className="flex flex-col gap-3">
          <Input
            label="Поиск товара"
            icon={<Search className="h-4 w-4" />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Название…"
          />
          <div className="thin-scroll flex max-h-72 flex-col gap-1.5 overflow-auto">
            {filtered.map((p) => {
              const eff = p.variants?.length
                ? p.variants.reduce((s, v) => s + (v.stock ?? 0), 0)
                : p.stock ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelected(p);
                    setVariant(null);
                    setQty(1);
                  }}
                  disabled={eff <= 0}
                  className={cn(
                    "card-2 flex shrink-0 items-center gap-3 p-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
                    eff <= 0 && "opacity-40"
                  )}
                >
                  <Image src={p.images?.[0]?.url} alt={p.title} size={96} className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]" />
                  <span className="min-w-0 flex-1 line-clamp-2 break-words text-[14px] leading-snug font-semibold text-[var(--text)]">{p.title}</span>
                  <span className="tabular shrink-0 pr-1 text-[12px] font-medium text-[var(--text-faint)]">{eff} шт</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Image src={selected.images?.[0]?.url} alt={selected.title} size={120} className="h-14 w-14 shrink-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]" />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 break-words text-[15px] leading-snug font-semibold text-[var(--text)]">{selected.title}</div>
              <div className="text-[12px] text-[var(--text-faint)]">
                {gift
                  ? `Цена ${money(selected.priceMinor, selected.currency)} → в подарок 0 ₴`
                  : `Цена ${money(selected.priceMinor, selected.currency)} × ${qty} = ${money(selected.priceMinor * qty, selected.currency)}`}
              </div>
            </div>
            <button type="button" onClick={reset} className="font-display hit shrink-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:underline">
              Другой
            </button>
          </div>

          {hasVariants && (
            <div>
              <label className="field-label mb-1.5 block">Вариант</label>
              <div className="flex flex-wrap gap-2">
                {selected.variants!.map((v) => (
                  <button
                    key={v.id ?? v.name}
                    type="button"
                    disabled={(v.stock ?? 0) <= 0}
                    onClick={() => {
                      setVariant(v);
                      setQty(1);
                    }}
                    className={cn(
                      "nb-chip nb-press h-8 px-3.5 text-[12.5px] transition-colors",
                      variant?.name === v.name
                        ? "nb-chip-active"
                        : "text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]",
                      (v.stock ?? 0) <= 0 && "opacity-40"
                    )}
                  >
                    {v.name} · {v.stock ?? 0}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-end gap-3">
            <Input
              label={`Количество (доступно ${available})`}
              inputMode="numeric"
              className="w-40"
              value={qtyText}
              onChange={(e) => setQtyText(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onBlur={() => qty < 1 && setQty(1)}
            />
            {qty > available && (
              <span className="pb-3 text-[12px] font-semibold text-[var(--danger-ink)]">Не хватает на складе</span>
            )}
          </div>

          <div className="card-2 px-3.5 py-3">
            <Toggle checked={gift} onChange={setGift} label="🎁 Подарок (бесплатно)" />
            <p className="mt-1 text-[12px] text-[var(--text-faint)]">
              {gift ? "Позиция добавится за 0 ₴ (итог не изменится)." : "Обычная платная позиция — итог заказа увеличится."}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Gifts over the monthly limit are taxed (18 % ПДФО + 5 % military levy on the excess) — red when the
 * customer is already over it or this gift takes them over, a quiet line otherwise.
 */
function GiftLimitNote({ limit, addMinor }: { limit: GiftLimit; addMinor: number }) {
  if (limit.limitMinor <= 0) return null;
  const after = limit.usedMinor + addMinor;
  if (after <= limit.limitMinor) {
    return (
      <p className="mb-3 text-[12px] text-[var(--text-faint)]">
        Подарков этому покупателю в этом месяце: {money(limit.usedMinor)} из {money(limit.limitMinor)}
        {addMinor > 0 && <> → с этим {money(after)}</>}.
      </p>
    );
  }
  const already = limit.usedMinor >= limit.limitMinor;
  return (
    <div
      role="alert"
      className="mb-3 flex gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3.5 py-3 text-[13px] leading-snug text-[var(--danger-ink)]"
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
      <div>
        <div className="font-semibold">
          {already
            ? "Внимание: этому покупателю в этом месяце уже выдано подарков сверх лимита"
            : "Внимание: этот подарок выведет покупателя за месячный лимит"}
        </div>
        <div className="mt-1">
          Уже выдано {money(limit.usedMinor)} при лимите {money(limit.limitMinor)}
          {addMinor > 0 && <>, с этим подарком — {money(after)} (превышение {money(after - limit.limitMinor)})</>}.
          С суммы сверх лимита нужно платить НДФЛ и военный сбор. Лучше дать скидку или отложить на следующий месяц.
        </div>
      </div>
    </div>
  );
}
