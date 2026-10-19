"use client";

/**
 * «Разом дешевше» 2.0 on the product page (docs/BUNDLES.md):
 *
 * - «Вместе дешевле» — one row per slot (one kind of accessory): the best model with a reason
 *   («В цвет», «Хит»…), its other colours as swatches, sizes inline (sleeves), up to two
 *   alternatives behind «Другие варианты»; a progress bar to the next tier; the set price; one
 *   button that puts the ticked set in the cart. Each accessory gets min(tier, its margin cap).
 *   A control group (`holdoutPercent` by a stable id) does not see this block — that is how the
 *   admin learns what the block really adds.
 * - «Собери сетап» — other big items in a matching colour (shown to everyone), «Добавить всё».
 *
 * The discount is decided again at checkout (bundle OR promo code, whichever is better), so the
 * numbers here mirror the server's rules (`bundleDiscount` / `setupDiscount` in @shop/shared).
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  bundleDiscount,
  bundleGroup,
  bundlePercent,
  bundleUnitDiscount,
  BUNDLE_MAX_ADDON_UNITS,
  BUNDLE_SWATCH,
  productColor,
  setupDiscount,
  type BundleOfferItem,
  type BundleProductOffer,
  type BundleSlot,
} from "@shop/shared";
import { useT } from "@/i18n/context";
import { trackAddToCart, trackBundleAdd, trackBundleHoldout, trackBundleView } from "@/lib/analytics";
import { bundleVisitorId, useBundleOffer } from "@/lib/bundle";
import { useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { money } from "@/lib/money";
import { spring } from "@/lib/motion";
import { haptic } from "@/lib/telegram";
import type { Product, ProductVariant } from "@/lib/api";

const hasVariants = (p: Product) => (p.variants?.length ?? 0) > 0;
const inStock = (p: Product) =>
  hasVariants(p) ? (p.variants ?? []).some((v) => v.stock > 0) : (p.stock ?? 0) > 0;
const firstVariant = (p: Product): ProductVariant | null =>
  hasVariants(p)
    ? [...(p.variants ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).find((v) => v.stock > 0) ?? null
    : null;

type Role = "primary" | "color" | "alt";
interface Option {
  item: BundleOfferItem;
  role: Role;
}

/** Slot options in stock: the primary, its colours, the alternatives. */
function optionsOf(slot: BundleSlot): Option[] {
  return [
    { item: slot.primary, role: "primary" as Role },
    ...slot.colors.map((item) => ({ item, role: "color" as Role })),
    ...slot.alternatives.map((item) => ({ item, role: "alt" as Role })),
  ].filter((o) => inStock(o.item.product));
}

/** 1.0 servers send only `items` — each becomes a slot without caps. */
function slotsOf(data: BundleProductOffer | undefined): BundleSlot[] {
  if (!data) return [];
  if (data.slots) return data.slots;
  return data.items.map((p) => ({
    categoryId: p.id,
    categoryName: null,
    pairPercent: 0,
    explore: false,
    primary: { product: p, capPercent: 100, reasons: [], kind: null },
    colors: [],
    alternatives: [],
  }));
}

/** Per-slot choice: which product, which size, ticked or not. */
interface Pick {
  id: string;
  variantId: string | null;
  on: boolean;
}

function useSlotPicks(slots: BundleSlot[], defaultOn: (i: number) => boolean) {
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const resolved = slots.map((slot, i) => {
    const opts = optionsOf(slot);
    const cur = picks[i];
    const opt = (cur && opts.find((o) => o.item.product.id === cur.id)) || opts[0];
    if (!opt) return null;
    const p = opt.item.product;
    const variantId =
      cur && cur.id === p.id && cur.variantId && (p.variants ?? []).some((v) => v.id === cur.variantId && v.stock > 0)
        ? cur.variantId
        : firstVariant(p)?.id ?? null;
    return { slot, opts, opt, variantId, on: cur ? cur.on : defaultOn(i) };
  });
  const set = (i: number, patch: Partial<Pick>) =>
    setPicks((prev) => {
      const r = resolved[i];
      const base: Pick = prev[i] ?? { id: r?.opt.item.product.id ?? "", variantId: r?.variantId ?? null, on: r?.on ?? false };
      return { ...prev, [i]: { ...base, ...patch } };
    });
  return { resolved, set };
}

export function BundleBlock({
  product,
  variant,
  needsVariant,
  onOpenProduct,
  onAdded,
}: {
  product: Product;
  /** The variant chosen for the main product (null when it has none or none is picked yet). */
  variant: ProductVariant | null;
  needsVariant: boolean;
  /** Opens an accessory's own page (tap on its picture). */
  onOpenProduct?: (p: Product) => void;
  onAdded?: () => void;
}) {
  const { data } = useBundleOffer(product.id);
  const terms = data?.terms;
  const group = useMemo(() => bundleGroup(bundleVisitorId(), terms?.holdoutPercent), [terms?.holdoutPercent]);
  if (!data || !terms || !inStock(product)) return null;
  return (
    <>
      {terms.enabled && (
        <AccessoryBlock
          data={data}
          group={group}
          product={product}
          variant={variant}
          needsVariant={needsVariant}
          onOpenProduct={onOpenProduct}
          onAdded={onAdded}
        />
      )}
      {terms.setupEnabled && (data.setup?.length ?? 0) > 0 && (
        <SetupBlock
          data={data}
          product={product}
          variant={variant}
          needsVariant={needsVariant}
          onOpenProduct={onOpenProduct}
          onAdded={onAdded}
        />
      )}
    </>
  );
}

function AccessoryBlock({
  data,
  group,
  product,
  variant,
  needsVariant,
  onOpenProduct,
  onAdded,
}: {
  data: BundleProductOffer;
  group: "B" | "H";
  product: Product;
  variant: ProductVariant | null;
  needsVariant: boolean;
  onOpenProduct?: (p: Product) => void;
  onAdded?: () => void;
}) {
  const t = useT();
  const terms = data.terms;
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const slots = useMemo(() => slotsOf(data).filter((s) => optionsOf(s).length > 0), [data]);
  const { resolved, set } = useSlotPicks(slots, (i) => i === 0);
  const rows = resolved.filter((r): r is NonNullable<typeof r> => !!r);

  const inCart = (id: string) => lines.some((l) => l.productId === id);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || slots.length === 0) return;
    viewed.current = true;
    const ids = slots.map((s) => s.primary.product.id);
    if (group === "H") trackBundleHoldout("product", ids);
    else trackBundleView("product", ids, slots.filter((s) => s.explore).length);
  }, [slots, group]);

  if (group === "H" || rows.length === 0) return null;

  const isOn = (r: (typeof rows)[number]) => r.on || inCart(r.opt.item.product.id);
  const on = rows.filter(isOn);
  const calc = bundleDiscount(
    terms,
    on.map((r) => ({ priceMinor: r.opt.item.product.priceMinor, capPercent: r.opt.item.capPercent })),
  );
  const discountOf = new Map(on.map((r, i) => [r.opt.item.product.id, { off: calc.perItem[i], pct: calc.percents[i] }]));
  const eligibleOn = on.filter((r) => r.opt.item.capPercent > 0).length;
  const allCaps = rows.map((r) => r.opt.item.capPercent);
  const capMax = Math.max(0, ...allCaps);
  const nextTier = Math.min(bundlePercent(terms, Math.min(eligibleOn + 1, BUNDLE_MAX_ADDON_UNITS)), capMax);
  const maxPercent = Math.min(bundlePercent(terms, Math.min(rows.length, BUNDLE_MAX_ADDON_UNITS)), capMax);

  const mainPrice = product.priceMinor;
  const sum = mainPrice + on.reduce((s, r) => s + r.opt.item.product.priceMinor, 0);
  const total = sum - calc.discountMinor;
  const currency = product.currency ?? "UAH";

  const mainInCart = inCart(product.id);
  const toAdd = on.filter((r) => !inCart(r.opt.item.product.id));
  const nothingToAdd = toAdd.length === 0 && mainInCart;
  const blocked = !mainInCart && needsVariant;

  const addSet = () => {
    if (nothingToAdd || blocked) return;
    haptic();
    if (!mainInCart) {
      add(product, variant, 1);
      trackAddToCart(product.id, variant?.id ?? null, 1);
    }
    for (const r of toAdd) {
      const p = r.opt.item.product;
      const v = (p.variants ?? []).find((x) => x.id === r.variantId) ?? null;
      add(p, v, 1);
      trackAddToCart(p.id, v?.id ?? null, 1);
      trackBundleAdd("product", [p.id], { slot: slots.indexOf(r.slot) + 1, kind: r.opt.role, ex: r.slot.explore });
    }
    onAdded?.();
  };

  const progressUnits = Math.min(eligibleOn, BUNDLE_MAX_ADDON_UNITS);
  const reachable = Math.min(rows.filter((r) => r.opt.item.capPercent > 0).length, BUNDLE_MAX_ADDON_UNITS);

  return (
    <section className="nb mt-5 p-3.5" aria-label={t("bundle.title")}>
      <div className="mb-3">
        <h3 className="font-display text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
          {t("bundle.title")}
        </h3>
        {maxPercent > 0 && (
          <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">{t("bundle.subtitle", { max: maxPercent })}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <MainRow product={product} price={mainPrice} currency={currency} label={t("bundle.thisItem")} />
        {rows.map((r, i) => {
          const p = r.opt.item.product;
          const ticked = isOn(r);
          const d = discountOf.get(p.id);
          const pct = ticked ? d?.pct ?? 0 : Math.min(nextTier, r.opt.item.capPercent);
          const off = ticked ? d?.off ?? 0 : bundleUnitDiscount(p.priceMinor, pct);
          return (
            <SlotRow
              key={r.slot.categoryId + i}
              slot={r.slot}
              opts={r.opts}
              opt={r.opt}
              variantId={r.variantId}
              ticked={ticked}
              locked={inCart(p.id)}
              percent={pct}
              off={off}
              currency={currency}
              onToggle={() => {
                haptic();
                if (!inCart(p.id)) set(i, { on: !r.on });
              }}
              onPick={(id) => {
                haptic();
                set(i, { id, variantId: null, on: true });
              }}
              onSize={(variantId) => {
                haptic();
                set(i, { variantId, on: true });
              }}
              onOpen={onOpenProduct}
            />
          );
        })}
      </div>

      {reachable > 1 && (
        <Progress units={progressUnits} steps={reachable} nextPercent={nextTier} maxPercent={maxPercent} />
      )}

      <Totals sum={sum} total={total} discount={calc.discountMinor} currency={currency} label={t("bundle.total")} />

      <AddButton
        onClick={addSet}
        state={nothingToAdd ? "done" : blocked ? "blocked" : "ready"}
        label={t("bundle.addSet")}
        doneLabel={t("bundle.added")}
      />
    </section>
  );
}

function SetupBlock({
  data,
  product,
  variant,
  needsVariant,
  onOpenProduct,
  onAdded,
}: {
  data: BundleProductOffer;
  product: Product;
  variant: ProductVariant | null;
  needsVariant: boolean;
  onOpenProduct?: (p: Product) => void;
  onAdded?: () => void;
}) {
  const t = useT();
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const slots = useMemo(() => (data.setup ?? []).filter((s) => optionsOf(s).length > 0), [data]);
  const { resolved, set } = useSlotPicks(slots, () => true);
  const rows = resolved.filter((r): r is NonNullable<typeof r> => !!r);
  const inCart = (id: string) => lines.some((l) => l.productId === id);
  if (rows.length === 0) return null;

  const currency = product.currency ?? "UAH";
  const isOn = (r: (typeof rows)[number]) => r.on || inCart(r.opt.item.product.id);
  const on = rows.filter(isOn);
  const items = [
    { priceMinor: product.priceMinor, capPercent: data.anchorSetupPercent ?? 0 },
    ...on.map((r) => ({ priceMinor: r.opt.item.product.priceMinor, capPercent: r.opt.item.capPercent })),
  ];
  const calc = setupDiscount(items);
  const offOf = new Map(on.map((r, i) => [r.opt.item.product.id, calc.perItem[i + 1]]));
  const sum = items.reduce((s, x) => s + x.priceMinor, 0);
  const total = sum - calc.discountMinor;
  const pct = data.terms.setupPercent ?? 0;

  const mainInCart = inCart(product.id);
  const toAdd = on.filter((r) => !inCart(r.opt.item.product.id));
  const nothingToAdd = toAdd.length === 0 && mainInCart;
  const blocked = !mainInCart && needsVariant;

  const addAll = () => {
    if (nothingToAdd || blocked) return;
    haptic();
    if (!mainInCart) {
      add(product, variant, 1);
      trackAddToCart(product.id, variant?.id ?? null, 1);
    }
    for (const r of toAdd) {
      const p = r.opt.item.product;
      const v = (p.variants ?? []).find((x) => x.id === r.variantId) ?? null;
      add(p, v, 1);
      trackAddToCart(p.id, v?.id ?? null, 1);
      trackBundleAdd("product", [p.id], { slot: 0, kind: "setup" });
    }
    onAdded?.();
  };

  return (
    <section className="nb mt-4 p-3.5" aria-label={t("bundle.setup.title")}>
      <div className="mb-3">
        <h3 className="font-display text-[16px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]">
          {t("bundle.setup.title")}
        </h3>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">
          {pct > 0 ? t("bundle.setup.subtitleDiscount", { n: pct }) : t("bundle.setup.subtitle")}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <MainRow product={product} price={product.priceMinor} currency={currency} label={t("bundle.thisItem")} />
        {rows.map((r, i) => {
          const p = r.opt.item.product;
          const off = offOf.get(p.id) ?? 0;
          return (
            <SlotRow
              key={r.slot.categoryId + i}
              slot={r.slot}
              opts={r.opts}
              opt={r.opt}
              variantId={r.variantId}
              ticked={isOn(r)}
              locked={inCart(p.id)}
              percent={off > 0 ? r.opt.item.capPercent : 0}
              off={off}
              currency={currency}
              hideReasonPair
              onToggle={() => {
                haptic();
                if (!inCart(p.id)) set(i, { on: !r.on });
              }}
              onPick={(id) => {
                haptic();
                set(i, { id, variantId: null, on: true });
              }}
              onSize={(variantId) => set(i, { variantId, on: true })}
              onOpen={onOpenProduct}
            />
          );
        })}
      </div>
      <Totals sum={sum} total={total} discount={calc.discountMinor} currency={currency} label={t("bundle.setup.total")} />
      <AddButton
        onClick={addAll}
        state={nothingToAdd ? "done" : blocked ? "blocked" : on.length === 0 ? "blocked-empty" : "ready"}
        label={t("bundle.setup.addAll")}
        doneLabel={t("bundle.setup.added")}
      />
    </section>
  );
}

// ---- pieces ----

function MainRow({ product, price, currency, label }: { product: Product; price: number; currency: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-2">
      <Thumb product={product} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)]">{label}</p>
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">{product.title}</p>
        <p className="font-display mt-0.5 text-[13px] font-bold tabular-nums text-[var(--ink)]">{money(price, currency)}</p>
      </div>
      <Tick on locked />
    </div>
  );
}

function SlotRow({
  slot,
  opts,
  opt,
  variantId,
  ticked,
  locked,
  percent,
  off,
  currency,
  hideReasonPair = false,
  onToggle,
  onPick,
  onSize,
  onOpen,
}: {
  slot: BundleSlot;
  opts: Option[];
  opt: Option;
  variantId: string | null;
  ticked: boolean;
  locked: boolean;
  percent: number;
  off: number;
  currency: string;
  hideReasonPair?: boolean;
  onToggle: () => void;
  onPick: (productId: string) => void;
  onSize: (variantId: string) => void;
  onOpen?: (p: Product) => void;
}) {
  const t = useT();
  const [altOpen, setAltOpen] = useState(false);
  const p = opt.item.product;
  const swatches = opts.filter((o) => o.role !== "alt");
  const alts = opts.filter((o) => o.role === "alt" && o.item.product.id !== p.id);
  // The primary of an alternative row: show the way back to it among the alternatives.
  const backToPrimary = opt.role === "alt" ? opts.filter((o) => o.role === "primary") : [];
  const variants = [...(p.variants ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const reasons: string[] = [];
  if (opt.item.reasons.includes("COLOR_MATCH")) reasons.push(t("bundle.reason.color"));
  if (opt.item.reasons.includes("HIT")) reasons.push(t("bundle.reason.hit"));
  if (opt.item.reasons.includes("LAST_ONE")) reasons.push(t("bundle.reason.last"));
  if (opt.role === "alt" && opt.item.kind) reasons.unshift(t(`bundle.alt.${opt.item.kind}` as "bundle.alt.CHEAPER"));
  if (!hideReasonPair && reasons.length === 0 && slot.pairPercent >= 10) {
    reasons.push(t("bundle.reason.pair", { n: slot.pairPercent }));
  }

  return (
    <div
      className={`rounded-[var(--r)] border p-2 transition-colors ${
        ticked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface-2)]"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onOpen?.(p)}
          disabled={!onOpen}
          aria-label={p.title}
          className="nb-press shrink-0"
        >
          <Thumb product={p} />
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={ticked}
          aria-label={p.title}
          onClick={onToggle}
          className="nb-press flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            {reasons.length > 0 && (
              <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--ok)]">
                {reasons.slice(0, 2).join(" · ")}
              </p>
            )}
            <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">{p.title}</p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-[13px] font-bold tabular-nums text-[var(--accent)]">
                {money(p.priceMinor - off, p.currency ?? currency)}
              </span>
              {off > 0 && (
                <span className="text-[11px] tabular-nums text-[var(--faint)] line-through">
                  {money(p.priceMinor, p.currency ?? currency)}
                </span>
              )}
              {percent > 0 && <PercentChip percent={percent} />}
            </div>
            {locked && <p className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{t("bundle.inCart")}</p>}
          </div>
          <Tick on={ticked} locked={locked} />
        </button>
      </div>

      {(swatches.length > 1 || variants.length > 0 || alts.length + backToPrimary.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-[68px]">
          {swatches.length > 1 && (
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("bundle.color")}>
              {swatches.map((o) => {
                const c = productColor(o.item.product);
                const active = o.item.product.id === p.id;
                return (
                  <button
                    key={o.item.product.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={`${t("bundle.color")}: ${o.item.product.title}`}
                    onClick={() => onPick(o.item.product.id)}
                    className={`relative h-6 w-6 rounded-full border-2 before:absolute before:-inset-1.5 before:content-[''] ${
                      active ? "border-[var(--accent)]" : "border-[var(--line-strong)]"
                    }`}
                    style={{ background: (c && BUNDLE_SWATCH[c]) || "var(--surface-3)" }}
                  />
                );
              })}
            </div>
          )}
          {variants.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t("bundle.size")}>
              {variants.map((v) => (
                <button
                  key={v.id ?? v.name}
                  type="button"
                  role="radio"
                  aria-checked={v.id === variantId}
                  disabled={v.stock <= 0}
                  onClick={() => v.id && onSize(v.id)}
                  className={`font-display h-7 min-w-[34px] rounded-full border px-2 text-[11px] font-bold ${
                    v.id === variantId
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "border-[var(--line-strong)] text-[var(--ink)] disabled:opacity-35"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
          {alts.length + backToPrimary.length > 0 && (
            <button
              type="button"
              aria-expanded={altOpen}
              onClick={() => setAltOpen((x) => !x)}
              className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-[var(--muted)]"
            >
              {t("bundle.alt.toggle")}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${altOpen ? "rotate-180" : ""}`} strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {altOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-1.5 pl-[68px]">
              {[...backToPrimary, ...alts].map((o) => (
                <button
                  key={o.item.product.id}
                  type="button"
                  onClick={() => {
                    onPick(o.item.product.id);
                    setAltOpen(false);
                  }}
                  className="nb-press flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] p-1.5 text-left"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px] bg-[var(--surface-3)]">
                    <Image src={o.item.product.images?.[0]?.url} alt="" size={80} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {o.item.kind && (
                      <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
                        {t(`bundle.alt.${o.item.kind}` as "bundle.alt.CHEAPER")}
                      </p>
                    )}
                    <p className="line-clamp-1 text-[12px] font-semibold text-[var(--ink)]">{o.item.product.title}</p>
                  </div>
                  <span className="font-display shrink-0 text-[12px] font-bold tabular-nums text-[var(--ink)]">
                    {money(o.item.product.priceMinor, o.item.product.currency ?? currency)}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Steps to the top tier: «Ещё 1 — скидка до 10 %». */
function Progress({ units, steps, nextPercent, maxPercent }: { units: number; steps: number; nextPercent: number; maxPercent: number }) {
  const t = useT();
  const left = steps - units;
  return (
    <div className="mt-3" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i < units ? "bg-[var(--ok)]" : "bg-[var(--surface-3)]"}`}
          />
        ))}
      </div>
      <p className="mt-1 text-[11.5px] font-semibold text-[var(--muted)]">
        {left > 0 && nextPercent > 0
          ? t("bundle.progress.next", { p: nextPercent })
          : t("bundle.progress.max", { p: maxPercent })}
      </p>
    </div>
  );
}

function Totals({ sum, total, discount, currency, label }: { sum: number; total: number; discount: number; currency: string; label: string }) {
  const t = useT();
  return (
    <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--line)] pt-3">
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-[var(--muted)]">{label}</p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[20px] font-bold tabular-nums leading-tight text-[var(--accent)]">
            {money(total, currency)}
          </span>
          {discount > 0 && <span className="text-[13px] tabular-nums text-[var(--faint)] line-through">{money(sum, currency)}</span>}
        </div>
      </div>
      {discount > 0 && (
        <span className="shrink-0 text-right text-[12px] font-bold text-[var(--ok)]">
          {t("bundle.save", { amount: money(discount, currency) })}
        </span>
      )}
    </div>
  );
}

function AddButton({
  onClick,
  state,
  label,
  doneLabel,
}: {
  onClick: () => void;
  state: "ready" | "done" | "blocked" | "blocked-empty";
  label: string;
  doneLabel: string;
}) {
  const t = useT();
  const disabled = state !== "ready";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`nb-up mt-3 inline-flex h-12 w-full items-center justify-center gap-2 px-4 text-[14px] font-semibold ${
        disabled
          ? "rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--faint)]"
          : "nb-accent nb-press"
      }`}
    >
      {state === "done" ? (
        <>
          <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          {doneLabel}
        </>
      ) : state === "blocked" ? (
        t("addToCart.chooseVariant")
      ) : (
        <>
          <Plus className="h-4 w-4 shrink-0" strokeWidth={2.5} />
          {label}
        </>
      )}
    </button>
  );
}

function Thumb({ product }: { product: Product }) {
  return (
    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] bg-[var(--surface-3)]">
      <Image src={product.images?.[0]?.url} alt={product.title} size={120} className="h-full w-full" />
    </div>
  );
}

function Tick({ on, locked = false }: { on: boolean; locked?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border ${
        on
          ? locked
            ? "border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--muted)]"
            : "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
          : "border-[var(--line-strong)]"
      }`}
    >
      {on && <Check className="h-4 w-4" strokeWidth={3} />}
    </span>
  );
}

/** «−5%» — the bundle percent of an accessory. */
export function PercentChip({ percent }: { percent: number }) {
  return (
    <span className="font-display inline-flex rounded-full bg-[var(--ok)] px-1.5 py-px text-[10px] font-bold tabular-nums leading-[1.5] text-[#0b0b0d]">
      −{percent}%
    </span>
  );
}
