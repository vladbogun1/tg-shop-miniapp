"use client";

/** The gift product (or the fallback one when the buyer gets a case): the picture, price, stock, the warnings. */
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useProductsQuery, type AdminProduct } from "@/features/product";
import { cn } from "@/lib/cn";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { productStock } from "@/lib/stock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { ProductPickModal } from "@/components/ProductPickModal";

export function GiftProductField({
  productId,
  dirty,
  on,
  isCase,
  onPick,
}: {
  productId: string;
  dirty: boolean;
  /** The gift switch. */
  on: boolean;
  isCase: boolean;
  onPick: (id: string) => void;
}) {
  const [picking, setPicking] = useState(false);
  const productsQ = useProductsQuery({ staleTime: 60_000 });
  const product = productId ? productsQ.data?.find((p) => p.id === productId) ?? null : null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="field-label">{isCase ? "Запасной товар-подарок" : "Товар-подарок"}</span>
        {dirty && <Badge tone="accent">Не сохранено</Badge>}
      </div>
      <div className="card-2 flex min-w-0 items-center gap-3 p-2.5">
        {product ? (
          <ProductLine product={product} />
        ) : (
          <div className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">
            {productId ? (productsQ.isLoading ? "Загрузка…" : "Товар не найден (удалён?)") : "Товар не выбран"}
          </div>
        )}
        <Button size="sm" variant="surface" className="shrink-0" onClick={() => setPicking(true)}>
          {productId ? "Другой" : "Выбрать"}
        </Button>
      </div>
      <ProductWarnings product={product} productId={productId} on={on} isCase={isCase} />
      <ProductPickModal
        open={picking}
        title="Товар-подарок"
        selectedId={productId}
        onClose={() => setPicking(false)}
        onPick={(p) => onPick(p.id)}
      />
    </div>
  );
}

function ProductLine({ product }: { product: AdminProduct }) {
  const stock = productStock(product);
  return (
    <>
      <Image
        src={product.images?.[0]?.url}
        alt={product.title}
        size={120}
        className="h-14 w-14 shrink-0 rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--surface-3)]"
      />
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 break-words text-[14px] font-semibold leading-snug text-[var(--text)]">{product.title}</div>
        <div className="tabular mt-0.5 text-[12px] text-[var(--text-faint)]">
          {money(product.priceMinor, product.currency)} ·{" "}
          <span className={stock <= 0 ? "font-semibold text-[var(--danger-ink)]" : undefined}>{stock <= 0 ? "нет в наличии" : `${stock} шт`}</span>
        </div>
      </div>
    </>
  );
}

function ProductWarnings({ product, productId, on, isCase }: { product: AdminProduct | null; productId: string; on: boolean; isCase: boolean }) {
  const variants = product?.variants ?? [];
  const best = variants.length ? [...variants].sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0] : null;
  return (
    <>
      {product && on && productStock(product) <= 0 && <Warn>Подарка нет на складе — покупатели его не увидят, пока не появится.</Warn>}
      {product && (product.archived || product.active === false) && <Warn>Товар скрыт из каталога — проверьте, что это нужный товар.</Warn>}
      {product && best && (
        <Warn tone="info">
          У товара есть варианты — в заказ попадёт тот, которого больше всего на складе
          {best.stock ? ` (сейчас «${best.name}», ${best.stock} шт)` : ""}.
        </Warn>
      )}
      <ModeWarnings productId={productId} on={on} isCase={isCase} />
    </>
  );
}

function ModeWarnings({ productId, on, isCase }: { productId: string; on: boolean; isCase: boolean }) {
  if (isCase) {
    return (
      <Warn tone="info">
        Кладётся от своего порога, если ни один кейс разыграть нельзя (выключены или нет призов)
        {productId ? "" : " — сейчас не выбран, тогда подарка не будет"}.
      </Warn>
    );
  }
  return on && !productId ? <Warn>Подарок включён, но товар не выбран — подарка не будет.</Warn> : null;
}

function Warn({ children, tone = "warn" }: { children: React.ReactNode; tone?: "warn" | "info" }) {
  return (
    <p className={cn("mt-2 flex items-start gap-2 text-[12.5px] leading-snug", tone === "warn" ? "text-[var(--warn)]" : "text-[var(--text-muted)]")}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
