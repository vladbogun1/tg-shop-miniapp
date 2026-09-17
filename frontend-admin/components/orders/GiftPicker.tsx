"use client";

/**
 * GiftPicker — admin picks a product (and variant, if any) from the catalog to add
 * as a FREE gift to an order. Stock is decremented server-side so the gifted unit
 * can't be sold to someone else. Price is 0 → order total/наложка don't change.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gift, Search } from "lucide-react";
import { adminApi, ApiError, type Product, type ProductVariant } from "@/lib/api";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { Image } from "@/lib/image";

export function GiftPicker({
  open,
  orderId,
  onClose,
  onDone,
}: {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { push } = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [qty, setQty] = useState(1);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: () => adminApi.products(),
    enabled: open,
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
    setQ("");
  }

  async function add() {
    if (!orderId || !selected || !canAdd) return;
    setSaving(true);
    try {
      await adminApi.addGift(orderId, {
        productId: selected.id,
        variantId: variant?.id,
        quantity: qty,
        notifyCustomer: notify,
      });
      push("Подарок добавлен 🎁", "ok");
      reset();
      onDone();
      onClose();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось добавить подарок", "error");
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
      title="🎁 Добавить подарок"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Toggle checked={notify} onChange={setNotify} label="Уведомить клиента" />
          <Button variant="accent" loading={saving} disabled={!canAdd} icon={<Gift className="h-4 w-4" />} onClick={add}>
            Добавить
          </Button>
        </div>
      }
    >
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
                    "flex items-center gap-3 rounded-[var(--r-sm)] border-2 border-[var(--border-2)] bg-[var(--surface)] p-2 text-left transition-colors hover:border-[var(--accent)]",
                    eff <= 0 && "opacity-40"
                  )}
                >
                  <Image src={p.images?.[0]?.url} alt={p.title} size={96} className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)]" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--text)]">{p.title}</span>
                  <span className="shrink-0 text-[12px] font-bold text-[var(--text-faint)]">{eff} шт</span>
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
            <Image src={selected.images?.[0]?.url} alt={selected.title} size={120} className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border-2 border-[var(--line)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-extrabold text-[var(--text)]">{selected.title}</div>
              <div className="text-[12px] text-[var(--text-faint)]">Цена {money(selected.priceMinor, selected.currency)} → в подарок 0 ₴</div>
            </div>
            <button type="button" onClick={reset} className="text-[12px] font-bold uppercase tracking-wide text-[var(--accent)] hover:underline">
              Другой
            </button>
          </div>

          {hasVariants && (
            <div>
              <label className="mb-1.5 block text-[12px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Вариант</label>
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
                      "rounded-[var(--r-sm)] border-2 px-3 py-1.5 text-[13px] font-bold transition-colors",
                      variant?.name === v.name
                        ? "border-[var(--line)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border-[var(--border-2)] bg-[var(--surface-2)] text-[var(--text-muted)]",
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
              value={String(qty)}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
            {qty > available && (
              <span className="pb-2.5 text-[12px] font-bold text-[var(--danger)]">Не хватает на складе</span>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
