"use client";

/** Building blocks of the product page's buy box (BuyBox.tsx): price, stock line, variants, quantity, buttons. */
import { Check, ShoppingBag, Truck, Zap } from "lucide-react";
import { maxQty } from "@shop/core/orders";
import { type ProductVariant } from "@shop/customer/catalog/model/product";
import { type StorefrontProduct } from "@shop/core/site";
import { Button, QtyStepper } from "@shop/ui/primitives";
import { PreorderPanel } from "@/features/preorder/view/PreorderPanel";
import { useI18n } from "@/i18n/context";
import { stockOf } from "@shop/customer/catalog/model/stock";
import { useOrderLimits } from "@/features/cart";
import { holdUntilText, isLive, type MyPreorder, type PreorderEta, useProductPreorder } from "@/features/preorder";
import { useFmt } from "@/lib/use-fmt";

type TFn = ReturnType<typeof useI18n>["t"];
type Fmt = ReturnType<typeof useFmt>;
type Pre = ReturnType<typeof useProductPreorder>["data"];
type Limits = ReturnType<typeof useOrderLimits>;

/** Who is waiting for what: the open batch of a variant, my own live places, units held for me. */
export function preorderLookups(pre: Pre) {
  const preLines = pre?.lines ?? [];
  /** The open batch that brings this variant (or the product); a product-level line covers every variant. */
  const etaFor = (v: ProductVariant | null): PreorderEta | null =>
    preLines.find((l) => (l.variantId ?? null) === (v?.id ?? null))?.eta ?? (v ? preLines.find((l) => !l.variantId)?.eta ?? null : null);
  const myLive = (pre?.mine ?? []).filter((m) => isLive(m.status));
  const mineFor = (v: ProductVariant | null): MyPreorder | null => myLive.find((m) => (m.variantId ?? null) === (v?.id ?? null)) ?? null;
  /** Units held for me: the catalog shows stock minus every hold, mine included. */
  const heldFor = (v: ProductVariant | null): number => {
    const m = mineFor(v);
    return m && m.status === "HELD" ? m.heldQty : 0;
  };
  const heldTotal = myLive.reduce((s, m) => s + (m.status === "HELD" ? m.heldQty : 0), 0);
  return { preLines, etaFor, mineFor, heldFor, heldTotal };
}

type Lookups = ReturnType<typeof preorderLookups>;

/** What can be bought right now: stock of the chosen variant (or the product), my held units. */
export function stockLevels(product: StorefrontProduct, hasVariants: boolean, variant: ProductVariant | null, lk: Lookups) {
  const totalStock = stockOf(product, null);
  const stockShown = hasVariants ? (variant ? variant.stock : totalStock) : totalStock;
  const held = hasVariants && !variant ? 0 : lk.heldFor(variant);
  const stock = Math.max(stockShown, held);
  const needVariant = hasVariants && !variant;
  return {
    stockShown,
    held,
    stock,
    inStock: totalStock > 0 || lk.heldTotal > 0,
    needVariant,
    canBuy: !needVariant && stock > 0,
  };
}

/** Sold out (the chosen variant, or the product): is it on its way / can one queue for it. */
export function soldOutState(
  variant: ProductVariant | null,
  lk: Lookups,
  pre: Pre,
  lv: Pick<ReturnType<typeof stockLevels>, "held" | "stock" | "inStock" | "needVariant">
) {
  const heldMine = lv.held > 0 ? lk.mineFor(variant) : null;
  const out = !lv.needVariant && lv.stock <= 0;
  const selEta = out ? lk.etaFor(variant) : null;
  const anyEta = !lv.inStock && lv.needVariant ? lk.preLines[0]?.eta ?? null : null;
  const showPanel = out && (!!selEta || !!pre?.anyProduct || !!lk.mineFor(variant));
  return { heldMine, out, selEta, anyEta, showPanel };
}

type Tone = "ok" | "pre" | "off";

const TONE_DOT: Record<Tone, string> = { ok: "var(--ok)", pre: "var(--pre)", off: "var(--faint)" };
const TONE_TEXT: Record<Tone, string> = { off: "var(--muted)", pre: "var(--pre)", ok: "var(--ink)" };

interface StockInfo {
  inStock: boolean;
  out: boolean;
  selEta: PreorderEta | null;
  anyEta: PreorderEta | null;
  hasVariants: boolean;
  etaFor: (v: ProductVariant | null) => PreorderEta | null;
  stock: number;
  held: number;
}

function stockTone(s: StockInfo): Tone {
  // pre-order: sold out, and a batch brings it (the chosen variant, or — before choosing — the product)
  const coming = !s.inStock ? s.selEta ?? s.anyEta ?? (!s.hasVariants ? s.etaFor(null) : null) : s.out && s.selEta ? s.selEta : null;
  if (s.inStock && (!s.out || !s.selEta)) return "ok";
  return coming ? "pre" : "off";
}

function stockLabel(t: TFn, tone: Tone, stock: number, held: number): string {
  if (tone === "pre") return t("preorder.badge");
  if (tone === "off") return t("product.outOfStock");
  return stock > 0 && stock <= 3 && !held ? t("product.lowStock", { n: stock }) : t("product.inStock");
}

export function StockLine({ info, t }: { info: StockInfo; t: TFn }) {
  const tone = stockTone(info);
  const color = TONE_DOT[tone];
  return (
    <p className="mt-4 flex items-center gap-2 text-[14px] font-semibold" aria-live="polite">
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: color, boxShadow: tone === "off" ? undefined : `0 0 8px ${color}` }}
      />
      <span style={{ color: TONE_TEXT[tone] }}>{stockLabel(t, tone, info.stock, info.held)}</span>
    </p>
  );
}

export function PriceBlock({ product, off, fmt, t }: { product: StorefrontProduct; off: number; fmt: Fmt; t: TFn }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <span className="font-display text-[34px] font-bold leading-none tabular-nums text-[var(--accent)] [text-shadow:0_0_24px_rgba(255,102,0,.35)]">
        {fmt.money(product.priceMinor, product.currency)}
      </span>
      {off > 0 && (
        <>
          <s className="font-display text-[18px] font-medium tabular-nums text-[var(--faint)]">{fmt.money(product.compareAtMinor, product.currency)}</s>
          <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-0.5 font-display text-[14px] font-bold text-[var(--accent-hi)]">
            {t("product.discount", { n: off })}
          </span>
        </>
      )}
    </div>
  );
}

function VariantChip({
  v,
  on,
  vOut,
  vComing,
  selectable,
  onPick,
  t,
}: {
  v: ProductVariant;
  on: boolean;
  vOut: boolean;
  vComing: boolean;
  selectable: boolean;
  onPick: () => void;
  t: TFn;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={!selectable}
      onClick={onPick}
      title={vOut && !vComing ? t("product.variantOut") : undefined}
      className={`tap inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 font-display text-[14px] font-semibold transition-colors ${
        on
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
          : "border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[rgba(255,255,255,.3)]"
      } disabled:cursor-not-allowed disabled:line-through disabled:opacity-45 ${vOut && !vComing && selectable ? "opacity-60" : ""}`}
    >
      {on && <Check className="h-4 w-4" strokeWidth={2.25} />}
      {v.name}
      {vComing && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--pre-soft)] px-1.5 py-px text-[10px] font-bold uppercase tracking-[.05em] text-[var(--pre)]">
          <Truck className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          {t("preorder.variantComing")}
        </span>
      )}
    </button>
  );
}

export function VariantPicker({
  variants,
  variant,
  onPick,
  needVariant,
  inStock,
  lk,
  anyProduct,
  t,
}: {
  variants: ProductVariant[];
  variant: ProductVariant | null;
  onPick: (v: ProductVariant) => void;
  needVariant: boolean;
  inStock: boolean;
  lk: Lookups;
  anyProduct: boolean;
  t: TFn;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="eyebrow mb-2.5 text-[11px]">
        {t("product.variant")}
        {needVariant && inStock ? ` — ${t("product.chooseVariant")}` : ""}
      </legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("product.variant")}>
        {variants.map((v) => {
          const vOut = v.stock <= 0 && lk.heldFor(v) <= 0;
          const vComing = vOut && !!lk.etaFor(v);
          return (
            <VariantChip
              key={v.id ?? v.name}
              v={v}
              on={variant?.id === v.id}
              vOut={vOut}
              vComing={vComing}
              selectable={!vOut || vComing || anyProduct}
              onPick={() => onPick(v)}
              t={t}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

/** «Held for you until …» / «We notified you» for the place I hold on the chosen variant. */
export function HeldNotice({ heldMine, locale, t }: { heldMine: MyPreorder | null; locale: ReturnType<typeof useI18n>["locale"]; t: TFn }) {
  return (
    <>
      {heldMine?.holdUntil && (
        <div className="mt-5 rounded-[var(--r-card)] border border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] p-3.5">
          <p className="font-display text-[15px] font-bold text-[var(--ink)]">
            {t("preorder.held.until", { when: holdUntilText(heldMine.holdUntil, locale) })}
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-[var(--muted)]">{t("preorder.held.hint")}</p>
        </div>
      )}
      {heldMine && heldMine.status === "NOTIFIED" && <p className="mt-5 font-display text-[15px] font-bold text-[var(--ink)]">{t("preorder.notified")}</p>}
    </>
  );
}

export function BuyPreorderPanel({
  product,
  variant,
  eta,
  mine,
  pre,
}: {
  product: StorefrontProduct;
  variant: ProductVariant | null;
  eta: PreorderEta | null;
  mine: MyPreorder | null;
  pre: Pre;
}) {
  return (
    <PreorderPanel
      key={variant?.id ?? "p"}
      productId={product.id}
      productTitle={product.title}
      variantId={variant?.id ?? null}
      variantName={variant?.name ?? null}
      eta={eta}
      waitingCount={pre?.waitingCount ?? null}
      mine={mine}
      holdHours={pre?.holdHours}
    />
  );
}

export function QtyRow({
  qty,
  onQty,
  stock,
  limits,
  inCart,
  hidden,
  t,
}: {
  qty: number;
  onQty: (n: number) => void;
  stock: number;
  limits: Limits;
  inCart: number;
  hidden: boolean;
  t: TFn;
}) {
  return (
    <div className={`mt-6 flex flex-wrap items-center gap-3 ${hidden ? "hidden" : ""}`}>
      <div className="flex items-center gap-3">
        <span className="eyebrow text-[11px]">{t("qty.label")}</span>
        <QtyStepper decreaseLabel={t("qty.decrease")} increaseLabel={t("qty.increase")} value={qty} onChange={onQty} min={1} max={maxQty(stock, limits)} />
      </div>
      {inCart > 0 && (
        <span className="text-[13px] font-medium text-[var(--muted)]">{t("product.inCart", { n: inCart })}</span>
      )}
    </div>
  );
}

export function ActionButtons({
  canBuy,
  inStock,
  needVariant,
  hidden,
  onAdd,
  onBuyNow,
  t,
}: {
  canBuy: boolean;
  inStock: boolean;
  needVariant: boolean;
  hidden: boolean;
  onAdd: () => void;
  onBuyNow: () => void;
  t: TFn;
}) {
  return (
    <div className={`mt-5 grid gap-3 sm:grid-cols-2 ${hidden ? "hidden" : ""}`}>
      <Button variant="accent" size="lg" disabled={!canBuy} icon={<ShoppingBag className="h-5 w-5" strokeWidth={2.25} />} onClick={onAdd}>
        {inStock ? (needVariant ? t("product.chooseVariant") : t("product.addToCart")) : t("product.outOfStock")}
      </Button>
      <Button variant="ink" size="lg" disabled={!canBuy} icon={<Zap className="h-5 w-5" strokeWidth={2.25} />} onClick={onBuyNow}>
        {t("product.buyNow")}
      </Button>
    </div>
  );
}
