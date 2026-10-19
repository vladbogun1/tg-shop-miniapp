"use client";

/**
 * «Разом дешевше» 2.0 on the product page, right under the buy buttons (docs/BUNDLES.md):
 *
 * - «Вместе дешевле»: this product + one row per slot (one kind of accessory) — the best model with a
 *   reason («В цвет», «Хит»…), its other colours as swatches, sizes inline, up to two alternatives
 *   behind «Другие варианты»; a progress bar to the next tier; the set total; «Додати комплект».
 *   Each accessory gets min(tier, its margin cap). The control group (`holdoutPercent` by the
 *   browser id) does not see it — that is how the admin learns what the block really adds.
 * - «Собери сетап»: other big items in a matching colour, shown to everyone, «Додати все».
 *
 * Loaded on the client after hydration so the cached product page stays as it is. The cart asks the
 * server again; the numbers here mirror it (`bundleDiscount` / `setupDiscount` in @shop/shared).
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, PackagePlus } from "lucide-react";
import Link from "next/link";
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
  type Product,
  type ProductVariant,
  type StorefrontProduct,
} from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/i18n/context";
import { trackAddToCart, trackBundle, visitorId } from "@/lib/analytics";
import { useBundleOfferQuery } from "@/lib/bundle";
import { stockOf, useCart } from "@/lib/cart";
import { Image } from "@/lib/image";
import { useFmt } from "@/lib/use-fmt";

function firstImage(p: Product): string | null {
  const imgs = (p.images ?? []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return imgs[0]?.url ?? null;
}

function slugOf(p: Product): string {
  return (p as Partial<StorefrontProduct>).slug || p.id;
}

const sortedVariants = (p: Product) => [...(p.variants ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
const inStock = (p: Product) => stockOf(p, null) > 0 || (p.variants ?? []).some((v) => v.stock > 0);
const firstVariant = (p: Product): ProductVariant | null =>
  (p.variants?.length ?? 0) > 0 ? sortedVariants(p).find((v) => v.stock > 0) ?? null : null;

type Role = "primary" | "color" | "alt";
interface Option {
  item: BundleOfferItem;
  role: Role;
}

function optionsOf(slot: BundleSlot): Option[] {
  return [
    { item: slot.primary, role: "primary" as Role },
    ...slot.colors.map((item) => ({ item, role: "color" as Role })),
    ...slot.alternatives.map((item) => ({ item, role: "alt" as Role })),
  ].filter((o) => inStock(o.item.product));
}

/** 1.0 servers send only `items` — each becomes a slot without caps. */
function slotsOf(data: BundleProductOffer): BundleSlot[] {
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
  const rows = resolved.filter((r): r is NonNullable<typeof r> => !!r);
  const set = (i: number, patch: Partial<Pick>) =>
    setPicks((prev) => {
      const r = resolved[i];
      const base: Pick = prev[i] ?? { id: r?.opt.item.product.id ?? "", variantId: r?.variantId ?? null, on: r?.on ?? false };
      return { ...prev, [i]: { ...base, ...patch } };
    });
  return { resolved, rows, set };
}

type Row = NonNullable<ReturnType<typeof useSlotPicks>["resolved"][number]>;

export function BundleOffer({
  product,
  variant,
  needVariant,
}: {
  product: StorefrontProduct;
  /** The variant chosen in the buy box (null for a product without variants). */
  variant: ProductVariant | null;
  /** The product has variants and none is chosen yet. */
  needVariant: boolean;
}) {
  const { data } = useBundleOfferQuery(product.id);
  const group = useMemo(() => bundleGroup(visitorId(), data?.terms?.holdoutPercent), [data?.terms?.holdoutPercent]);
  if (!data?.terms) return null;
  return (
    <>
      {data.terms.enabled && <AccessoryOffer data={data} group={group} product={product} variant={variant} needVariant={needVariant} />}
      {data.terms.setupEnabled && (data.setup?.length ?? 0) > 0 && (
        <SetupOffer data={data} product={product} variant={variant} needVariant={needVariant} />
      )}
    </>
  );
}

function useAddRows(product: StorefrontProduct, variant: ProductVariant | null, needVariant: boolean) {
  const add = useCart((s) => s.add);
  const openDrawer = useCart((s) => s.openDrawer);
  const lines = useCart((s) => s.lines);
  const inCart = (id: string) => lines.some((l) => l.productId === id && l.stock > 0);
  const mainInCart = inCart(product.id);
  const blocked = needVariant && !mainInCart;
  const addRows = (rows: Row[], extra: (r: Row) => { slot: number; kind: string; ex?: boolean }, done: string) => {
    if (!mainInCart) {
      add(product, variant, 1);
      trackAddToCart(product.id, variant?.id ?? null, 1);
    }
    for (const r of rows) {
      const p = r.opt.item.product;
      const v = (p.variants ?? []).find((x) => x.id === r.variantId) ?? null;
      add(p, v, 1);
      trackAddToCart(p.id, v?.id ?? null, 1);
      trackBundle("bundle_add", "product", [p.id], extra(r));
    }
    toast(done);
    openDrawer();
  };
  return { inCart, mainInCart, blocked, addRows };
}

function AccessoryOffer({
  data,
  group,
  product,
  variant,
  needVariant,
}: {
  data: BundleProductOffer;
  group: "B" | "H";
  product: StorefrontProduct;
  variant: ProductVariant | null;
  needVariant: boolean;
}) {
  const { t } = useI18n();
  const terms = data.terms;
  const slots = useMemo(() => slotsOf(data).filter((s) => optionsOf(s).length > 0).slice(0, 3), [data]);
  const { rows, set } = useSlotPicks(slots, (i) => i === 0);
  const { inCart, mainInCart, blocked, addRows } = useAddRows(product, variant, needVariant);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || slots.length === 0) return;
    viewed.current = true;
    const ids = slots.map((s) => s.primary.product.id);
    if (group === "H") trackBundle("bundle_holdout", "product", ids);
    else trackBundle("bundle_view", "product", ids, { ex: slots.filter((s) => s.explore).length });
  }, [slots, group]);

  if (group === "H" || rows.length === 0) return null;

  const isOn = (r: Row) => r.on || inCart(r.opt.item.product.id);
  const on = rows.filter(isOn);
  const calc = bundleDiscount(
    terms,
    on.map((r) => ({ priceMinor: r.opt.item.product.priceMinor, capPercent: r.opt.item.capPercent })),
  );
  const discountOf = new Map(on.map((r, i) => [r.opt.item.product.id, { off: calc.perItem[i], pct: calc.percents[i] }]));
  const eligibleOn = on.filter((r) => r.opt.item.capPercent > 0).length;
  const capMax = Math.max(0, ...rows.map((r) => r.opt.item.capPercent));
  const nextTier = Math.min(bundlePercent(terms, Math.min(eligibleOn + 1, BUNDLE_MAX_ADDON_UNITS)), capMax);
  const maxPercent = Math.min(bundlePercent(terms, Math.min(rows.length, BUNDLE_MAX_ADDON_UNITS)), capMax);
  const reachable = Math.min(rows.filter((r) => r.opt.item.capPercent > 0).length, BUNDLE_MAX_ADDON_UNITS);

  const currency = product.currency ?? "UAH";
  const sum = product.priceMinor + on.reduce((s, r) => s + r.opt.item.product.priceMinor, 0);
  const total = sum - calc.discountMinor;
  const toAdd = on.filter((r) => !inCart(r.opt.item.product.id));

  return (
    <section aria-labelledby="pd-bundle" className="nb mt-6 p-4 sm:p-5">
      <Head id="pd-bundle" title={t("bundle.title")} note={maxPercent > 0 ? t("bundle.subtitle", { n: maxPercent }) : null} />
      <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
        <MainRow product={product} inCart={mainInCart} />
        {rows.map((r, i) => {
          const p = r.opt.item.product;
          const ticked = isOn(r);
          const d = discountOf.get(p.id);
          const pct = ticked ? d?.pct ?? 0 : Math.min(nextTier, r.opt.item.capPercent);
          const off = ticked ? d?.off ?? 0 : bundleUnitDiscount(p.priceMinor, pct);
          return (
            <SlotRow
              key={r.slot.categoryId + i}
              row={r}
              ticked={ticked}
              locked={inCart(p.id)}
              percent={pct}
              off={off}
              currency={currency}
              onToggle={() => !inCart(p.id) && set(i, { on: !r.on })}
              onPick={(id) => set(i, { id, variantId: null, on: true })}
              onSize={(variantId) => set(i, { variantId, on: true })}
            />
          );
        })}
      </ul>
      {reachable > 1 && <Progress units={Math.min(eligibleOn, BUNDLE_MAX_ADDON_UNITS)} steps={reachable} next={nextTier} max={maxPercent} />}
      <Footer
        sum={sum}
        total={total}
        discount={calc.discountMinor}
        currency={currency}
        label={t("bundle.total")}
        empty={on.length === 0}
        blocked={blocked && on.length > 0}
        disabled={toAdd.length === 0 && mainInCart ? true : on.length === 0 || blocked}
        button={toAdd.length === 0 && mainInCart ? t("bundle.added") : t("bundle.add")}
        onAdd={() =>
          addRows(toAdd, (r) => ({ slot: slots.indexOf(r.slot) + 1, kind: r.opt.role, ex: r.slot.explore }), t("bundle.added"))
        }
      />
    </section>
  );
}

function SetupOffer({
  data,
  product,
  variant,
  needVariant,
}: {
  data: BundleProductOffer;
  product: StorefrontProduct;
  variant: ProductVariant | null;
  needVariant: boolean;
}) {
  const { t } = useI18n();
  const slots = useMemo(() => (data.setup ?? []).filter((s) => optionsOf(s).length > 0), [data]);
  const { rows, set } = useSlotPicks(slots, () => true);
  const { inCart, mainInCart, blocked, addRows } = useAddRows(product, variant, needVariant);
  if (rows.length === 0) return null;

  const isOn = (r: Row) => r.on || inCart(r.opt.item.product.id);
  const on = rows.filter(isOn);
  const items = [
    { priceMinor: product.priceMinor, capPercent: data.anchorSetupPercent ?? 0 },
    ...on.map((r) => ({ priceMinor: r.opt.item.product.priceMinor, capPercent: r.opt.item.capPercent })),
  ];
  const calc = setupDiscount(items);
  const offOf = new Map(on.map((r, i) => [r.opt.item.product.id, calc.perItem[i + 1]]));
  const sum = items.reduce((s, x) => s + x.priceMinor, 0);
  const currency = product.currency ?? "UAH";
  const pct = data.terms.setupPercent ?? 0;
  const toAdd = on.filter((r) => !inCart(r.opt.item.product.id));

  return (
    <section aria-labelledby="pd-setup" className="nb mt-4 p-4 sm:p-5">
      <Head
        id="pd-setup"
        title={t("bundle.setup.title")}
        note={pct > 0 ? t("bundle.setup.subtitleDiscount", { n: pct }) : t("bundle.setup.subtitle")}
      />
      <ul className="mt-3 flex flex-col divide-y divide-[var(--line)]">
        <MainRow product={product} inCart={mainInCart} />
        {rows.map((r, i) => {
          const p = r.opt.item.product;
          const off = offOf.get(p.id) ?? 0;
          return (
            <SlotRow
              key={r.slot.categoryId + i}
              row={r}
              ticked={isOn(r)}
              locked={inCart(p.id)}
              percent={off > 0 ? r.opt.item.capPercent : 0}
              off={off}
              currency={currency}
              noPairReason
              onToggle={() => !inCart(p.id) && set(i, { on: !r.on })}
              onPick={(id) => set(i, { id, variantId: null, on: true })}
              onSize={(variantId) => set(i, { variantId, on: true })}
            />
          );
        })}
      </ul>
      <Footer
        sum={sum}
        total={sum - calc.discountMinor}
        discount={calc.discountMinor}
        currency={currency}
        label={t("bundle.setup.total")}
        empty={on.length === 0}
        blocked={blocked && on.length > 0}
        disabled={toAdd.length === 0 && mainInCart ? true : on.length === 0 || blocked}
        button={toAdd.length === 0 && mainInCart ? t("bundle.setup.added") : t("bundle.setup.addAll")}
        onAdd={() => addRows(toAdd, () => ({ slot: 0, kind: "setup" }), t("bundle.setup.added"))}
      />
    </section>
  );
}

// ---- pieces ----

function Head({ id, title, note }: { id: string; title: string; note: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="flex items-center gap-2.5 font-display text-[18px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
        <span aria-hidden className="tech-mark" />
        {title}
      </h2>
      {note && <p className="text-[12px] font-medium text-[var(--muted)]">{note}</p>}
    </div>
  );
}

function MainRow({ product, inCart }: { product: StorefrontProduct; inCart: boolean }) {
  const { t } = useI18n();
  const fmt = useFmt();
  const currency = product.currency ?? "UAH";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-hi)]">
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
        <Image src={firstImage(product)} alt="" size={120} className="h-full w-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-[10px]">{inCart ? t("bundle.inCart") : t("bundle.thisItem")}</span>
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)]">{product.title}</span>
      </span>
      <span className="shrink-0 font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">{fmt.money(product.priceMinor, currency)}</span>
    </li>
  );
}

function SlotRow({
  row,
  ticked,
  locked,
  percent,
  off,
  currency,
  noPairReason = false,
  onToggle,
  onPick,
  onSize,
}: {
  row: Row;
  ticked: boolean;
  locked: boolean;
  percent: number;
  off: number;
  currency: string;
  noPairReason?: boolean;
  onToggle: () => void;
  onPick: (productId: string) => void;
  onSize: (variantId: string) => void;
}) {
  const { t, href } = useI18n();
  const fmt = useFmt();
  const [altOpen, setAltOpen] = useState(false);
  const { slot, opts, opt, variantId } = row;
  const p = opt.item.product;
  const pHref = href(`/product/${slugOf(p)}`);
  const swatches = opts.filter((o) => o.role !== "alt");
  const others = [
    ...(opt.role === "alt" ? opts.filter((o) => o.role === "primary") : []),
    ...opts.filter((o) => o.role === "alt" && o.item.product.id !== p.id),
  ];
  const variants = sortedVariants(p);
  const cur = p.currency ?? currency;

  const reasons: string[] = [];
  if (opt.role === "alt" && opt.item.kind) reasons.push(t(`bundle.alt.${opt.item.kind}` as "bundle.alt.CHEAPER"));
  if (opt.item.reasons.includes("COLOR_MATCH") && !reasons.length) reasons.push(t("bundle.reason.color"));
  if (opt.item.reasons.includes("HIT")) reasons.push(t("bundle.reason.hit"));
  if (opt.item.reasons.includes("LAST_ONE")) reasons.push(t("bundle.reason.last"));
  if (!noPairReason && reasons.length === 0 && slot.pairPercent >= 10) reasons.push(t("bundle.reason.pair", { n: slot.pairPercent }));

  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={ticked}
          aria-label={t("bundle.include", { title: p.title })}
          onClick={onToggle}
          disabled={locked}
          className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border transition-colors before:absolute before:-inset-2.5 before:content-[''] ${
            ticked
              ? locked
                ? "border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--muted)]"
                : "border-[var(--accent)] bg-[var(--accent)] text-[#0e0e10]"
              : "border-[var(--line-strong)] bg-[var(--surface-2)] text-transparent hover:border-[var(--accent)]"
          }`}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
        <Link href={pHref} className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)]">
          <Image src={firstImage(p)} alt={p.title} size={120} className="h-full w-full" />
        </Link>
        <span className="min-w-0 flex-1">
          {reasons.length > 0 && (
            <span className="block truncate text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--ok)]">{reasons.slice(0, 2).join(" · ")}</span>
          )}
          <Link href={pHref} className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-hi)]">
            {p.title}
          </Link>
          {locked && <span className="block text-[11px] font-semibold text-[var(--muted)]">{t("bundle.inCart")}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {percent > 0 && (
            <span className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-1.5 font-display text-[11px] font-bold text-[var(--accent-hi)]">
              {t("product.discount", { n: percent })}
            </span>
          )}
          <span className={`font-display text-[15px] font-bold tabular-nums ${off > 0 ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}>
            {fmt.money(p.priceMinor - off, cur)}
          </span>
          {off > 0 && <s className="font-display text-[12px] font-medium tabular-nums text-[var(--faint)]">{fmt.money(p.priceMinor, cur)}</s>}
        </span>
      </div>

      {(swatches.length > 1 || variants.length > 0 || others.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-9 sm:pl-[100px]">
          {swatches.length > 1 && (
            <span className="flex items-center gap-1.5" role="radiogroup" aria-label={t("bundle.color")}>
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
                    title={o.item.product.title}
                    onClick={() => onPick(o.item.product.id)}
                    className={`relative h-6 w-6 rounded-full border-2 before:absolute before:-inset-1.5 before:content-[''] ${
                      active ? "border-[var(--accent)]" : "border-[var(--line-strong)] hover:border-[var(--ink)]"
                    }`}
                    style={{ background: (c && BUNDLE_SWATCH[c]) || "var(--surface-3)" }}
                  />
                );
              })}
            </span>
          )}
          {variants.length > 0 && (
            <span className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t("bundle.size")}>
              {variants.map((v) => (
                <button
                  key={v.id ?? v.name}
                  type="button"
                  role="radio"
                  aria-checked={v.id === variantId}
                  disabled={v.stock <= 0}
                  onClick={() => v.id && onSize(v.id)}
                  className={`h-7 min-w-[34px] rounded-full border px-2 font-display text-[11px] font-bold transition-colors ${
                    v.id === variantId
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[#0e0e10]"
                      : "border-[var(--line-strong)] text-[var(--ink)] hover:border-[var(--accent)] disabled:opacity-35"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </span>
          )}
          {others.length > 0 && (
            <button
              type="button"
              aria-expanded={altOpen}
              onClick={() => setAltOpen((x) => !x)}
              className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
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
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-col gap-1.5 pl-9 sm:pl-[100px]">
              {others.map((o) => (
                <button
                  key={o.item.product.id}
                  type="button"
                  onClick={() => {
                    onPick(o.item.product.id);
                    setAltOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-1.5 text-left transition-colors hover:border-[var(--accent)]"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-[6px] bg-[var(--surface-3)]">
                    <Image src={firstImage(o.item.product)} alt="" size={80} className="h-full w-full" />
                  </span>
                  <span className="min-w-0 flex-1">
                    {o.item.kind && (
                      <span className="block text-[10px] font-bold uppercase tracking-[.06em] text-[var(--muted)]">
                        {t(`bundle.alt.${o.item.kind}` as "bundle.alt.CHEAPER")}
                      </span>
                    )}
                    <span className="line-clamp-1 text-[12px] font-semibold text-[var(--ink)]">{o.item.product.title}</span>
                  </span>
                  <span className="shrink-0 font-display text-[12px] font-bold tabular-nums text-[var(--ink)]">
                    {fmt.money(o.item.product.priceMinor, o.item.product.currency ?? currency)}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function Progress({ units, steps, next, max }: { units: number; steps: number; next: number; max: number }) {
  const { t } = useI18n();
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: steps }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < units ? "bg-[var(--ok)]" : "bg-[var(--surface-3)]"}`} />
        ))}
      </div>
      <p className="mt-1 text-[12px] font-semibold text-[var(--muted)]">
        {steps - units > 0 && next > 0 ? t("bundle.progress.next", { p: next }) : t("bundle.progress.max", { p: max })}
      </p>
    </div>
  );
}

function Footer({
  sum,
  total,
  discount,
  currency,
  label,
  empty,
  blocked,
  disabled,
  button,
  onAdd,
}: {
  sum: number;
  total: number;
  discount: number;
  currency: string;
  label: string;
  empty: boolean;
  blocked: boolean;
  disabled: boolean;
  button: string;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="eyebrow text-[11px]">{label}</span>
          <span className="font-display text-[22px] font-bold leading-none tabular-nums text-[var(--accent)]">{fmt.money(total, currency)}</span>
          {discount > 0 && <s className="font-display text-[14px] font-medium tabular-nums text-[var(--faint)]">{fmt.money(sum, currency)}</s>}
        </p>
        {discount > 0 ? (
          <p className="mt-1 text-[13px] font-semibold text-[var(--ok)]">{t("bundle.save", { amount: fmt.money(discount, currency) })}</p>
        ) : empty ? (
          <p className="mt-1 text-[12px] font-medium text-[var(--muted)]">{t("bundle.pickSome")}</p>
        ) : null}
        {blocked && <p className="mt-1 text-[12px] font-semibold text-[var(--warn)]">{t("bundle.chooseVariant")}</p>}
      </div>
      <Button
        variant="accent"
        size="md"
        disabled={disabled}
        icon={<PackagePlus className="h-5 w-5" strokeWidth={2.25} />}
        onClick={onAdd}
        className="sm:shrink-0"
      >
        {button}
      </Button>
    </div>
  );
}
