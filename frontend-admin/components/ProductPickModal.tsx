"use client";

/**
 * Pick one product (gift for the order sum, product to preview the offer for): search by title over
 * the admin product list, photo + title in two lines + price + stock. Archived products are hidden.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { adminApi, type AdminProduct } from "@/lib/api";
import { productStock } from "@/lib/stock";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { Input } from "@/components/ui/Input";
import { Modal } from "@shop/ui/overlay";

export function ProductPickModal({
  open,
  title,
  onClose,
  onPick,
  selectedId,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (p: AdminProduct) => void;
  selectedId?: string | null;
}) {
  const [q, setQ] = useState("");
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => adminApi.products(),
    enabled: open,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => !p.archived)
      .filter((p) => (s ? p.title.toLowerCase().includes(s) : true))
      .slice(0, 60);
  }, [products, q]);

  function close() {
    setQ("");
    onClose();
  }

  return (
    <Modal open={open} onClose={close} size="md" title={title}>
      <div className="flex min-w-0 flex-col gap-3">
        <Input
          aria-label="Поиск товара"
          icon={<Search className="h-4 w-4" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Название…"
        />
        <div className="thin-scroll flex max-h-[min(60vh,420px)] flex-col gap-1.5 overflow-auto">
          {filtered.map((p) => {
            const stock = productStock(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onPick(p);
                  close();
                }}
                className={cn(
                  "card-2 flex shrink-0 items-center gap-3 p-2 text-left transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-3)]",
                  p.id === selectedId && "!border-[var(--accent)]"
                )}
              >
                <Image
                  src={p.images?.[0]?.url}
                  alt={p.title}
                  size={96}
                  className="h-11 w-11 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{p.title}</span>
                  <span className="tabular mt-0.5 block text-[12px] text-[var(--text-faint)]">
                    {money(p.priceMinor, p.currency)}
                    {" · "}
                    <span className={stock <= 0 ? "font-semibold text-[var(--danger-ink)]" : undefined}>
                      {stock <= 0 ? "нет в наличии" : `${stock} шт`}
                    </span>
                    {p.active === false && " · скрыт"}
                  </span>
                </span>
              </button>
            );
          })}
          {!isLoading && filtered.length === 0 && <p className="p-2 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</p>}
          {isLoading && <p className="p-2 text-[13px] text-[var(--text-faint)]">Загрузка товаров…</p>}
        </div>
      </div>
    </Modal>
  );
}
