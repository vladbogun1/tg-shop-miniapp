"use client";

/**
 * FilterSheet — the catalog's bottom sheet (catalog v2, docs/CATALOG-SPECS.md §5).
 *
 * Edits a DRAFT of the filter so the ~200-card grid underneath is not re-rendered on every tap
 * (iPhone taps stay responsive); the sticky footer counts the products live through the shared
 * engine. Whatever is set is applied when the sheet closes — by the button, ✕, the backdrop or
 * Telegram's back button — so nothing the customer picked is silently thrown away.
 *
 * Sections: brand · price from–to · in stock · condition, then the selected category's facets
 * grouped by schema.groups. Without a category only a hint stands in for the spec facets.
 * No backdrop blur, no per-chip motion: the sheet slides, its contents just render.
 */
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  buildFacets,
  filterProducts,
  MARKDOWN_COLLECTION_SLUG,
  parseRange,
  priceBounds,
  toggleFacet,
  type CatalogFilter,
  type CatalogSchema,
  type Facet,
} from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { EMPTY_FILTER, type EngineItem } from "@/lib/catalog";
import { backdrop, sheetVariants } from "@/lib/motion";
import { haptic, useBackButton } from "@/lib/telegram";

export function FilterSheet({
  open,
  schema,
  items,
  filter,
  q,
  onApply,
}: {
  open: boolean;
  schema: CatalogSchema;
  items: EngineItem[];
  filter: CatalogFilter;
  /** Current search, so the live count matches the grid. */
  q: string;
  /** Called with the edited filter when the sheet closes. */
  onApply: (f: CatalogFilter) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && <SheetBody schema={schema} items={items} filter={filter} q={q} onApply={onApply} />}
    </AnimatePresence>,
    document.body,
  );
}

function SheetBody({
  schema,
  items,
  filter,
  q,
  onApply,
}: {
  schema: CatalogSchema;
  items: EngineItem[];
  filter: CatalogFilter;
  q: string;
  onApply: (f: CatalogFilter) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CatalogFilter>(filter);
  const withQ = useMemo(() => ({ ...draft, q: q.trim() || undefined }), [draft, q]);

  const count = useMemo(() => filterProducts(schema, items, withQ).length, [schema, items, withQ]);
  const facets = useMemo(
    () => buildFacets(schema, items, withQ, { brand: t("catalog.filter.brand"), condition: t("catalog.filter.condition") }),
    [schema, items, withQ, t],
  );
  const bounds = useMemo(() => priceBounds(schema, items, withQ), [schema, items, withQ]);

  const close = () => onApply(draft);
  useBackButton(true, close);

  // Page under the sheet stays put.
  useEffect(() => {
    const body = document.body.style;
    const prev = body.overflow;
    body.overflow = "hidden";
    return () => {
      body.overflow = prev;
    };
  }, []);

  const toggle = (key: string, value: string) => {
    haptic();
    setDraft((d) => toggleFacet(d, key, value));
  };

  const brand = facets.find((f) => f.key === "brand");
  const cond = facets.find((f) => f.key === "cond");
  const specFacets = facets.filter((f) => f.key !== "brand" && f.key !== "cond");
  const groups = [...schema.groups].sort((a, b) => a.sort - b.sort);
  const grouped = groups
    .map((g) => ({ key: g.key, label: g.label, facets: specFacets.filter((f) => f.group === g.key) }))
    .filter((g) => g.facets.length > 0);
  const orphans = specFacets.filter((f) => !groups.some((g) => g.key === f.group));
  if (orphans.length) grouped.push({ key: "_other", label: t("catalog.filter.specs"), facets: orphans });
  const noCategory = !draft.category || draft.category === MARKDOWN_COLLECTION_SLUG;

  return (
    <motion.div
      variants={backdrop}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={close}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t("catalog.filters")}
        variants={sheetVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[16px] border border-b-0 border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-[var(--line-strong)]" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3 pt-1.5">
          <h2 className="font-display flex items-center gap-2 text-[17px] font-extrabold uppercase tracking-[0.04em] text-[var(--ink)]">
            <SlidersHorizontal className="h-[18px] w-[18px] text-[var(--accent)]" strokeWidth={2.5} />
            {t("catalog.filters")}
          </h2>
          <button
            type="button"
            onClick={() => {
              haptic();
              close();
            }}
            aria-label={t("common.close")}
            className="tap -mr-1.5 grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] active:scale-95"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        <div
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {brand && (
            <Section title={brand.label}>
              <OptionChips facet={brand} onToggle={(v) => toggle("brand", v)} />
            </Section>
          )}

          <Section title={t("catalog.filter.price")}>
            <RangeInputs
              min={draft.priceMin ?? null}
              max={draft.priceMax ?? null}
              placeholderMin={bounds?.min}
              placeholderMax={bounds?.max}
              onChange={(min, max) => setDraft((d) => ({ ...d, priceMin: min, priceMax: max }))}
            />
          </Section>

          <div className="mt-5">
            <Toggle
              label={t("catalog.filter.inStock")}
              on={!!draft.inStock}
              onChange={(v) => {
                haptic();
                setDraft((d) => ({ ...d, inStock: v }));
              }}
            />
          </div>

          {cond && (
            <Section title={cond.label}>
              <OptionChips facet={cond} onToggle={(v) => toggle("cond", v)} />
            </Section>
          )}

          {noCategory ? (
            <p className="mt-6 rounded-[var(--r)] border border-dashed border-[var(--line-strong)] px-3.5 py-3 text-[13px] leading-snug text-[var(--muted)]">
              {t("catalog.filter.chooseCategory")}
            </p>
          ) : (
            grouped.map((g) => (
              <div key={g.key} className="mt-6">
                <p className="eyebrow !text-[10px] !tracking-[0.22em] text-[var(--accent)]">{g.label}</p>
                {g.facets.map((f) => (
                  <Section key={f.key} title={f.unit && f.kind !== "range" ? `${f.label}, ${f.unit}` : f.label} small>
                    {f.kind === "range" ? (
                      <RangeInputs
                        unit={f.unit ?? undefined}
                        min={f.selectedRange?.min ?? null}
                        max={f.selectedRange?.max ?? null}
                        placeholderMin={f.min}
                        placeholderMax={f.max}
                        decimals
                        onChange={(min, max) =>
                          setDraft((d) => ({
                            ...d,
                            attrs: { ...(d.attrs ?? {}), [f.key]: min == null && max == null ? [] : [`${min ?? ""}..${max ?? ""}`] },
                          }))
                        }
                      />
                    ) : (
                      <OptionChips facet={f} onToggle={(v) => toggle(f.key, v)} />
                    )}
                  </Section>
                ))}
              </div>
            ))
          )}
        </div>

        {/* sticky footer */}
        <div
          className="flex shrink-0 gap-2.5 border-t border-[var(--line)] bg-[var(--surface)] px-4 pt-3"
          style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}
        >
          <button
            type="button"
            onClick={() => {
              haptic();
              setDraft({ ...EMPTY_FILTER, category: draft.category ?? null });
            }}
            className="font-display nb-press tap shrink-0 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--ink)]"
          >
            {t("catalog.filter.reset")}
          </button>
          <button
            type="button"
            onClick={() => {
              haptic();
              close();
            }}
            className="nb-accent nb-press nb-up h-12 flex-1 px-3 text-[13.5px]"
          >
            {count > 0 ? t("catalog.filter.show", { n: count }) : t("catalog.filter.showNone")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Section({ title, children, small }: { title: string; children: ReactNode; small?: boolean }) {
  return (
    <section className={small ? "mt-3.5" : "mt-5"}>
      <h3
        className={
          small
            ? "mb-2 text-[13px] font-semibold text-[var(--ink)]"
            : "font-display mb-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]"
        }
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function OptionChips({ facet, onToggle }: { facet: Facet; onToggle: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {facet.values.map((v) => {
        const empty = v.count === 0 && !v.selected;
        return (
          <button
            key={v.value}
            type="button"
            disabled={empty}
            aria-pressed={v.selected}
            onClick={() => onToggle(v.value)}
            className={`nb-chip nb-press inline-flex min-h-[36px] items-center gap-1.5 px-3 py-1.5 text-[13px] disabled:opacity-35 ${
              v.selected ? "nb-chip-active" : ""
            } ${v.count === 0 ? "opacity-50" : ""}`}
          >
            <span>{v.label}</span>
            <span className={`text-[11px] font-semibold tabular-nums ${v.selected ? "text-[var(--accent-hi)]" : "text-[var(--faint)]"}`}>
              {v.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Two numeric fields "от … до …": text inputs with a numeric keyboard — no browser spinners. */
function RangeInputs({
  min,
  max,
  placeholderMin,
  placeholderMax,
  unit,
  decimals,
  onChange,
}: {
  min: number | null;
  max: number | null;
  placeholderMin?: number;
  placeholderMax?: number;
  unit?: string;
  decimals?: boolean;
  onChange: (min: number | null, max: number | null) => void;
}) {
  const { t, tag } = useI18n();
  const fmt = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? "" : new Intl.NumberFormat(tag, { maximumFractionDigits: 2 }).format(n));
  return (
    <div className="flex items-center gap-2">
      <NumField
        prefix={t("catalog.filter.from")}
        unit={unit}
        value={min}
        placeholder={fmt(placeholderMin)}
        decimals={decimals}
        onChange={(v) => onChange(v, max)}
      />
      <span aria-hidden className="h-px w-3 shrink-0 bg-[var(--line-strong)]" />
      <NumField
        prefix={t("catalog.filter.to")}
        unit={unit}
        value={max}
        placeholder={fmt(placeholderMax)}
        decimals={decimals}
        onChange={(v) => onChange(min, v)}
      />
    </div>
  );
}

function NumField({
  prefix,
  unit,
  value,
  placeholder,
  decimals,
  onChange,
}: {
  prefix: string;
  unit?: string;
  value: number | null;
  placeholder: string;
  decimals?: boolean;
  onChange: (v: number | null) => void;
}) {
  // Local text so "1," / "" survive typing; the number goes up on every valid change.
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText((cur) => {
      const parsed = parseNum(cur);
      return parsed === value ? cur : value == null ? "" : String(value);
    });
  }, [value]);

  return (
    <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
      <span className="font-display shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--faint)]">{prefix}</span>
      <input
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(decimals ? /[^\d.,]/g : /\D/g, "").slice(0, 9);
          setText(raw);
          onChange(parseNum(raw));
        }}
        className="h-11 w-full min-w-0 bg-transparent text-[15px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:font-normal placeholder:text-[var(--faint)]"
      />
      {unit && <span className="shrink-0 text-[12px] font-medium text-[var(--muted)]">{unit}</span>}
    </label>
  );
}

function parseNum(s: string): number | null {
  const v = s.replace(",", ".").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-left"
    >
      <span className="text-[14px] font-semibold text-[var(--ink)]">{label}</span>
      <span
        aria-hidden
        className={`relative h-[26px] w-[44px] shrink-0 rounded-full border transition-colors duration-150 ${
          on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)] bg-[var(--surface-3)]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[20px] w-[20px] rounded-full transition-transform duration-150 ${
            on ? "translate-x-[20px] bg-[var(--accent-ink)]" : "translate-x-[2px] bg-[var(--muted)]"
          }`}
        />
      </span>
    </button>
  );
}

/** "Mouse weight: 45–54 g" chips under the category row; × removes one value. */
export function activeFilterChips(
  schema: CatalogSchema,
  f: CatalogFilter,
  t: (k: string, p?: Record<string, string | number>) => string,
  tag: string,
): { id: string; label: string; remove: (f: CatalogFilter) => CatalogFilter }[] {
  const nf = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const range = (min: number | null | undefined, max: number | null | undefined, unit?: string | null) => {
    const u = unit ? ` ${unit}` : "";
    if (min != null && max != null) return `${nf.format(min)}–${nf.format(max)}${u}`;
    if (min != null) return t("catalog.filter.rangeFrom", { n: nf.format(min) }) + u;
    return t("catalog.filter.rangeTo", { n: nf.format(max ?? 0) }) + u;
  };
  const out: { id: string; label: string; remove: (f: CatalogFilter) => CatalogFilter }[] = [];
  for (const b of f.brands ?? []) {
    out.push({ id: `b:${b}`, label: schema.brands.find((x) => x.slug === b)?.name ?? b, remove: (x) => toggleFacet(x, "brand", b) });
  }
  if (f.priceMin != null || f.priceMax != null) {
    out.push({ id: "price", label: range(f.priceMin, f.priceMax, "₴"), remove: (x) => ({ ...x, priceMin: null, priceMax: null }) });
  }
  if (f.inStock) out.push({ id: "stock", label: t("catalog.filter.inStock"), remove: (x) => ({ ...x, inStock: false }) });
  for (const c of f.conditions ?? []) {
    out.push({ id: `c:${c}`, label: schema.conditions.find((x) => x.value === c)?.label ?? c, remove: (x) => toggleFacet(x, "cond", c) });
  }
  for (const [key, values] of Object.entries(f.attrs ?? {})) {
    const a = schema.attributes.find((x) => x.key === key);
    if (!a || !values?.length) continue;
    if (a.type === "bool") {
      out.push({ id: `a:${key}`, label: a.label, remove: (x) => ({ ...x, attrs: { ...(x.attrs ?? {}), [key]: [] } }) });
      continue;
    }
    if (a.type === "number" && !a.buckets?.length) {
      const r = parseRange(values[0]);
      if (r) out.push({ id: `a:${key}`, label: `${a.label} ${range(r.min, r.max, a.unit)}`, remove: (x) => ({ ...x, attrs: { ...(x.attrs ?? {}), [key]: [] } }) });
      continue;
    }
    for (const v of values) {
      const label = a.options?.find((o) => o.value === v)?.label ?? a.buckets?.find((b) => b.id === v)?.label ?? v;
      const text = a.type === "number" ? `${a.label}: ${label}${a.unit ? ` ${a.unit}` : ""}` : label;
      out.push({ id: `a:${key}:${v}`, label: text, remove: (x) => toggleFacet(x, key, v) });
    }
  }
  return out;
}
