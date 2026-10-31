"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type CatalogFilter, type Facet, toggleFacet } from "@shop/core/catalog";
import { useI18n } from "@/i18n/context";
import { useDebounced } from "@/lib/hooks";
import { rangeToken, useNav, plainClick, withFilter } from "./CatalogNav";

export const SHOW_FIRST = 6;
export const COLLAPSE_AFTER = 8;

/** The panel body over the DRAFT selection (desktop column and the drawer render the same one). */
export function FacetPanel({ hint }: { /** /catalog and search: no category → no characteristic facets, say why. */ hint?: boolean }) {
  const { t } = useI18n();
  const { view, draft: f, applied, appliedTokens, openKeys } = useNav();
  if (!view) return null;
  const price = view.price;
  const priceSet = f.priceMin != null || f.priceMax != null;
  const priceChanged = f.priceMin !== applied.filter.priceMin || f.priceMax !== applied.filter.priceMax;
  return (
    <div className="flex flex-col">
      <Section title={t("catalog.availability")} open>
        <OptionRow next={{ ...f, inStock: !f.inStock }} selected={!!f.inStock} changed={!!f.inStock !== appliedTokens.has("stock")} label={t("catalog.inStock")} />
      </Section>
      {price && (price.max > price.min || priceSet) && (
        <Section title={t("catalog.price")} open selected={priceSet}>
          <RangeForm
            min={price.min}
            max={price.max}
            from={f.priceMin ?? null}
            to={f.priceMax ?? null}
            changed={priceChanged}
            onChange={(a, b) => ({ ...f, priceMin: a, priceMax: b })}
          />
        </Section>
      )}
      {view.facets.map((facet) => {
        const selected = facet.kind === "range" ? !!facet.selectedRange : facet.values.some((v) => v.selected);
        return (
          <Section
            key={facet.key}
            title={facet.unit && facet.kind !== "options" ? `${facet.label}, ${facet.unit}` : facet.label}
            open={openKeys.has(facet.key)}
            selected={selected}
          >
            {facet.kind === "range" ? (
              <RangeForm
                min={facet.min ?? 0}
                max={facet.max ?? 0}
                from={facet.selectedRange?.min ?? null}
                to={facet.selectedRange?.max ?? null}
                changed={rangeToken(facet.key, f) !== rangeToken(facet.key, applied.filter)}
                onChange={(a, b) => {
                  const attrs = { ...(f.attrs ?? {}) };
                  if (a == null && b == null) delete attrs[facet.key];
                  else attrs[facet.key] = [`${a ?? ""}..${b ?? ""}`];
                  return { ...f, attrs };
                }}
              />
            ) : (
              <OptionList facet={facet} />
            )}
          </Section>
        );
      })}
      {hint && <p className="mt-4 text-[13px] font-medium leading-snug text-[var(--muted)]">{t("catalog.hintCategory")}</p>}
    </div>
  );
}

export function Section({ title, open, selected, children }: { title: string; open?: boolean; selected?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group/sec border-b border-[var(--line)] py-3 last:border-b-0 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-[var(--r)] text-[13px] font-semibold text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{title}</span>
          {selected && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] shadow-[0_0_6px_rgba(255,102,0,.8)]" />}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open/sec:rotate-180" strokeWidth={2.25} />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

export function OptionList({ facet }: { facet: Facet }) {
  const { t } = useI18n();
  const { draft, appliedTokens } = useNav();
  const [all, setAll] = useState(false);
  const long = facet.values.length > COLLAPSE_AFTER;
  const shown = !long || all ? facet.values : facet.values.filter((v, i) => i < SHOW_FIRST || v.selected);
  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((v) => {
        const next =
          facet.kind === "bool"
            ? { ...draft, attrs: { ...(draft.attrs ?? {}), [facet.key]: v.selected ? [] : ["1"] } }
            : toggleFacet(draft, facet.key, v.value);
        return (
          <li key={v.value}>
            <OptionRow
              next={next}
              selected={v.selected}
              changed={v.selected !== appliedTokens.has(`${facet.key}:${facet.kind === "bool" ? "1" : v.value}`)}
              label={facet.kind === "bool" ? t("catalog.yes") : v.label}
              count={v.count}
            />
          </li>
        );
      })}
      {long && (
        <li>
          <button
            type="button"
            onClick={() => setAll((x) => !x)}
            className="mt-1 min-h-9 px-1 text-[13px] font-semibold text-[var(--accent-hi)] transition-colors hover:text-[var(--ink)]"
          >
            {all ? t("catalog.lessValues") : t("catalog.moreValues", { n: facet.values.length })}
          </button>
        </li>
      )}
    </ul>
  );
}

/** Changed in the draft, not applied yet: a soft orange row with an accent edge. */
export const CHANGED = "bg-[rgba(255,102,0,.08)] shadow-[inset_2px_0_0_var(--accent)]";

/**
 * One option: a link to the applied state with this value toggled (no JS / new tab), a draft toggle
 * on a plain click or Space.
 */
export function OptionRow({ next, selected, changed, label, count }: { next: CatalogFilter; selected: boolean; changed: boolean; label: string; count?: number }) {
  const { url, applied, setDraft } = useNav();
  const disabled = !selected && count === 0;
  const toggle = (el: Element) => setDraft(next, el);
  return (
    <a
      href={url(withFilter(applied, next))}
      rel="nofollow"
      role="checkbox"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      data-changed={changed || undefined}
      onClick={(e) => {
        if (!plainClick(e)) return;
        e.preventDefault();
        toggle(e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (e.key !== " ") return;
        e.preventDefault();
        toggle(e.currentTarget);
      }}
      className={`group/opt flex min-h-9 items-center gap-2.5 rounded-[var(--r)] px-1.5 text-[14px] font-medium transition-colors ${changed ? CHANGED : "hover:bg-[var(--surface-2)]"} ${
        selected ? "text-[var(--ink)]" : disabled ? "pointer-events-none text-[var(--faint)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${
          selected
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : changed
              ? "border-dashed border-[var(--accent)] bg-[var(--surface-2)]"
              : "border-[var(--line-strong)] bg-[var(--surface-2)] group-hover/opt:border-[rgba(255,255,255,.3)]"
        }`}
      >
        {selected && <Check className="h-3 w-3 text-[var(--accent-ink)]" strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="shrink-0 font-display text-[12px] tabular-nums text-[var(--faint)]">{count}</span>}
    </a>
  );
}

export const num = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

/** «від – до»: typed bounds go into the draft after a pause, on blur or Enter. */
export function RangeForm({
  min,
  max,
  from,
  to,
  changed,
  onChange,
}: {
  min: number;
  max: number;
  from: number | null;
  to: number | null;
  changed: boolean;
  onChange: (from: number | null, to: number | null) => CatalogFilter;
}) {
  const { t } = useI18n();
  const { setDraft } = useNav();
  const ref = useRef<HTMLFormElement>(null);
  const [a, setA] = useState(from != null ? String(from) : "");
  const [b, setB] = useState(to != null ? String(to) : "");
  useEffect(() => setA(from != null ? String(from) : ""), [from]);
  useEffect(() => setB(to != null ? String(to) : ""), [to]);

  const commit = (sa: string, sb: string) => {
    let lo = num(sa);
    let hi = num(sb);
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    // A bound equal to the edge of the data is no filter.
    if (lo != null && lo <= min) lo = null;
    if (hi != null && hi >= max) hi = null;
    if (lo === from && hi === to) return;
    setDraft(onChange(lo, hi), ref.current);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const da = useDebounced(a, 700);
  const db = useDebounced(b, 700);
  useEffect(() => commitRef.current(da, db), [da, db]);

  const input =
    "h-10 w-full min-w-0 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 font-display text-[14px] font-semibold tabular-nums text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)]";
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        commit(a, b);
      }}
      data-changed={changed || undefined}
      className={`flex items-center gap-2 rounded-[var(--r)] p-1 transition-colors ${changed ? CHANGED : ""}`}
    >
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        value={a}
        onChange={(e) => setA(e.target.value)}
        onBlur={() => commit(a, b)}
        placeholder={`${t("catalog.from")} ${min}`}
        aria-label={t("catalog.from")}
        className={input}
      />
      <span aria-hidden className="text-[var(--faint)]">–</span>
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        value={b}
        onChange={(e) => setB(e.target.value)}
        onBlur={() => commit(a, b)}
        placeholder={`${t("catalog.to")} ${max}`}
        aria-label={t("catalog.to")}
        className={input}
      />
      {/* Enter submits the form (= commit to the draft); no visible button. */}
      <button type="submit" hidden tabIndex={-1} />
    </form>
  );
}

// ---------------------------------------------------------------- desktop column (≥ 1280 px)

/**
 * Smart sticky: a panel shorter than the screen sticks under the header; a longer one scrolls with
 * the page and sticks by its BOTTOM edge, so every section is reachable without a scroll of its own.
 */
