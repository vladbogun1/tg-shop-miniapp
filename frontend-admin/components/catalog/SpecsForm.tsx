"use client";

/**
 * «Характеристики» step of the product wizard: a form generated from the attribute schema of the
 * product's category path (+ global attributes), grouped like the storefront block.
 *  number → field with the unit (range → «от» / «до»); enum → chips (or a searchable list when
 *  long); multi → toggle chips; bool → Да / Нет / Не знаю; text → plain field.
 * Required fields carry «*»; fields filled by the AI show a confidence dot (source in the tooltip);
 * every filled field has «очистить» (no key = unknown).
 */
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminSpecAttribute, AdminSpecGroup, CardMeta, ProductSpecs, SpecValue } from "@/lib/api";
import { groupAttributes, isSpecEmpty } from "@/lib/catalog-admin";
import { cn } from "@/lib/cn";
import { ConfidenceDot } from "./CardBits";
import { Popover } from "./Popover";

const FIELD =
  "h-10 w-full min-w-0 bg-transparent px-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] pointer-coarse:h-11";
const BOX =
  "flex items-center rounded-[var(--r-md)] border bg-[var(--surface-2)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--border-2)] focus-within:!border-[var(--accent)] focus-within:shadow-[var(--ring-accent)]";

function parseNum(s: string): number | null | typeof NaN {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const numText = (n: number | undefined | null) => (n === undefined || n === null ? "" : String(n));

/** Raw text of number fields, so "12," or "-" can be typed without being rejected. */
function rawFromSpecs(attrs: AdminSpecAttribute[], specs: ProductSpecs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of attrs) {
    if (a.type !== "number") continue;
    const v = specs[a.key];
    if (typeof v === "number") {
      out[a.key] = numText(v);
      out[`${a.key}.min`] = numText(v);
      out[`${a.key}.max`] = numText(v);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[`${a.key}.min`] = numText(v.min);
      out[`${a.key}.max`] = numText(v.max);
      out[a.key] = numText(v.min);
    }
  }
  return out;
}

export function SpecsForm({
  attrs,
  groups,
  specs,
  onChange,
  meta,
  resetKey,
  highlightMissing,
}: {
  attrs: AdminSpecAttribute[];
  groups: AdminSpecGroup[];
  specs: ProductSpecs;
  onChange: (next: ProductSpecs) => void;
  meta?: CardMeta | null;
  /** Changes when the form is (re)opened or the category changes — re-reads the number texts. */
  resetKey: string;
  highlightMissing?: boolean;
}) {
  const [raw, setRaw] = useState<Record<string, string>>(() => rawFromSpecs(attrs, specs));
  useEffect(() => {
    setRaw(rawFromSpecs(attrs, specs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const grouped = useMemo(() => groupAttributes(attrs, groups), [attrs, groups]);

  function setValue(key: string, v: SpecValue | undefined) {
    const next = { ...specs };
    if (v === undefined || isSpecEmpty(v)) delete next[key];
    else next[key] = v;
    onChange(next);
  }

  function clear(a: AdminSpecAttribute) {
    setRaw((r) => ({ ...r, [a.key]: "", [`${a.key}.min`]: "", [`${a.key}.max`]: "" }));
    setValue(a.key, undefined);
  }

  function onNumber(a: AdminSpecAttribute, text: string) {
    setRaw((r) => ({ ...r, [a.key]: text }));
    const n = parseNum(text);
    if (n === null) setValue(a.key, undefined);
    else if (!Number.isNaN(n)) setValue(a.key, n);
  }

  function onRange(a: AdminSpecAttribute, side: "min" | "max", text: string) {
    const r2 = { ...raw, [`${a.key}.${side}`]: text };
    setRaw(r2);
    const min = parseNum(r2[`${a.key}.min`] ?? "");
    const max = parseNum(r2[`${a.key}.max`] ?? "");
    if (Number.isNaN(min) || Number.isNaN(max)) return;
    if (min === null && max === null) setValue(a.key, undefined);
    // One side only = a single value (min = max).
    else setValue(a.key, { min: (min ?? max) as number, max: (max ?? min) as number });
  }

  if (attrs.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {grouped.map((g) => (
        <section key={g.key} className="flex flex-col gap-3">
          <h3 className="font-display flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <span aria-hidden className="h-[2px] w-3 rounded-full bg-[var(--accent)]" />
            {g.label}
          </h3>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            {g.items.map((a) => {
              const v = specs[a.key];
              const empty = isSpecEmpty(v);
              const conf = meta?.fields?.[a.key];
              const missing = !!highlightMissing && a.required && empty;
              const wide = (a.type === "multi" || (a.type === "enum" && a.options.length <= 8 && a.options.length > 3)) && a.options.length > 0;
              const id = `spec-${a.key}`;
              const rawMin = raw[`${a.key}.min`] ?? "";
              const rawMax = raw[`${a.key}.max`] ?? "";
              const rangeBad =
                a.range &&
                (Number.isNaN(parseNum(rawMin)) ||
                  Number.isNaN(parseNum(rawMax)) ||
                  ((parseNum(rawMin) ?? -Infinity) as number) > ((parseNum(rawMax) ?? Infinity) as number));
              const numBad = a.type === "number" && !a.range && Number.isNaN(parseNum(raw[a.key] ?? ""));
              return (
                <div key={a.key} className={cn("flex min-w-0 flex-col gap-1.5", wide && "sm:col-span-2")}>
                  <div className="flex min-h-[18px] items-center gap-2">
                    <label htmlFor={id} className="field-label min-w-0 truncate">
                      {a.labelRu}
                      {a.required && (
                        <span className="ml-0.5 text-[var(--accent-hi)]" title="Обязательная" aria-label="обязательная">
                          *
                        </span>
                      )}
                    </label>
                    {conf?.c != null && !empty && <ConfidenceDot c={conf.c} src={conf.src} />}
                    <AnimatePresence>
                      {!empty && (
                        <motion.button
                          type="button"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => clear(a)}
                          aria-label={`Очистить «${a.labelRu}»`}
                          className="focusable ml-auto shrink-0 rounded-[var(--r-sm)] px-1 text-[11.5px] text-[var(--text-faint)] hover:text-[var(--text)]"
                        >
                          очистить
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>

                  {a.type === "number" && !a.range && (
                    <div className={cn(BOX, numBad ? "!border-[var(--danger)]" : missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]")}>
                      <input
                        id={id}
                        inputMode="decimal"
                        className={cn(FIELD, "tabular")}
                        value={raw[a.key] ?? ""}
                        placeholder="—"
                        onChange={(e) => onNumber(a, e.target.value)}
                      />
                      {a.unitRu && <span className="shrink-0 pr-3 text-[13px] text-[var(--text-faint)]">{a.unitRu}</span>}
                    </div>
                  )}

                  {a.type === "number" && a.range && (
                    <div className="flex items-center gap-2">
                      <div className={cn(BOX, "flex-1", rangeBad ? "!border-[var(--danger)]" : missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]")}>
                        <span className="shrink-0 pl-3 text-[12px] text-[var(--text-faint)]">от</span>
                        <input id={id} inputMode="decimal" aria-label={`${a.labelRu}: от`} className={cn(FIELD, "tabular pl-2")} value={rawMin} placeholder="—" onChange={(e) => onRange(a, "min", e.target.value)} />
                      </div>
                      <div className={cn(BOX, "flex-1", rangeBad ? "!border-[var(--danger)]" : missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]")}>
                        <span className="shrink-0 pl-3 text-[12px] text-[var(--text-faint)]">до</span>
                        <input inputMode="decimal" aria-label={`${a.labelRu}: до`} className={cn(FIELD, "tabular pl-2")} value={rawMax} placeholder="—" onChange={(e) => onRange(a, "max", e.target.value)} />
                        {a.unitRu && <span className="shrink-0 pr-3 text-[13px] text-[var(--text-faint)]">{a.unitRu}</span>}
                      </div>
                    </div>
                  )}

                  {a.type === "text" && (
                    <div className={cn(BOX, missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]")}>
                      <input
                        id={id}
                        className={FIELD}
                        value={typeof v === "string" ? v : ""}
                        placeholder="—"
                        maxLength={255}
                        onChange={(e) => setValue(a.key, e.target.value === "" ? undefined : e.target.value)}
                      />
                    </div>
                  )}

                  {a.type === "bool" && (
                    <TriState id={id} value={typeof v === "boolean" ? v : null} onChange={(b) => setValue(a.key, b === null ? undefined : b)} missing={missing} />
                  )}

                  {a.type === "enum" &&
                    (a.options.length <= 8 ? (
                      <Chips
                        id={id}
                        attr={a}
                        selected={typeof v === "string" ? [v] : []}
                        onToggle={(val) => setValue(a.key, v === val ? undefined : val)}
                        single
                        missing={missing}
                      />
                    ) : (
                      <OptionPicker id={id} attr={a} value={typeof v === "string" ? v : ""} onChange={(val) => setValue(a.key, val || undefined)} missing={missing} />
                    ))}

                  {a.type === "multi" && (
                    <Chips
                      id={id}
                      attr={a}
                      selected={Array.isArray(v) ? v : []}
                      onToggle={(val) => {
                        const cur = Array.isArray(v) ? v : [];
                        setValue(a.key, cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]);
                      }}
                      missing={missing}
                    />
                  )}

                  {(numBad || rangeBad) && <span className="text-[12px] text-[var(--danger-ink)]">{numBad ? "Нужно число" : "«От» больше «до» или не число"}</span>}
                  {typeof v === "string" && (a.type === "enum") && !a.options.some((o) => o.value === v) && (
                    <span className="text-[12px] text-[var(--warn)]">Значение «{v}» не из списка — при сохранении отбросится</span>
                  )}
                  {a.hint && !numBad && !rangeBad && <span className="line-clamp-1 text-[11.5px] text-[var(--text-faint)]" title={a.hint}>{a.hint}</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function TriState({ id, value, onChange, missing }: { id: string; value: boolean | null; onChange: (v: boolean | null) => void; missing?: boolean }) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: true, label: "Да" },
    { v: false, label: "Нет" },
    { v: null, label: "Не знаю" },
  ];
  return (
    <div
      id={id}
      role="radiogroup"
      className={cn(
        "inline-flex h-10 w-full items-center gap-0.5 rounded-[var(--r-md)] border bg-[var(--bg-2)] p-[3px] pointer-coarse:h-11",
        missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]"
      )}
    >
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.v)}
            className={cn(
              "focusable font-display h-full flex-1 rounded-[var(--r-sm)] border text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors",
              on
                ? o.v === null
                  ? "border-[var(--line-strong)] bg-[var(--surface-3)] text-[var(--text)]"
                  : "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Chips({
  id,
  attr,
  selected,
  onToggle,
  single,
  missing,
}: {
  id: string;
  attr: AdminSpecAttribute;
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
  missing?: boolean;
}) {
  const [all, setAll] = useState(false);
  const opts = [...attr.options].sort((a, b) => a.sortOrder - b.sortOrder);
  const LIMIT = 14;
  const shown = all || opts.length <= LIMIT ? opts : opts.filter((o, i) => i < LIMIT || selected.includes(o.value));
  return (
    <div
      id={id}
      role={single ? "radiogroup" : "group"}
      className={cn("flex flex-wrap gap-1.5 rounded-[var(--r-md)]", missing && "ring-1 ring-[color-mix(in_srgb,var(--warn)_55%,transparent)] ring-offset-4 ring-offset-[var(--surface)]")}
    >
      {shown.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={single ? "radio" : "checkbox"}
            aria-checked={on}
            onClick={() => onToggle(o.value)}
            className={cn(
              "nb-chip nb-press focusable inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] transition-colors",
              on ? "nb-chip-active" : "text-[var(--text-muted)] hover:border-[var(--border-2)] hover:text-[var(--text)]"
            )}
          >
            {on && <Check className="h-3.5 w-3.5" />}
            {o.labelRu}
          </button>
        );
      })}
      {opts.length > LIMIT && (
        <button type="button" onClick={() => setAll((v) => !v)} className="focusable rounded-[var(--r-sm)] px-2 text-[12px] font-semibold text-[var(--accent-hi)] hover:underline">
          {all ? "Свернуть" : `Ещё ${opts.length - shown.length}`}
        </button>
      )}
    </div>
  );
}

/** Searchable single choice for long option lists (sensors, switches). */
function OptionPicker({
  id,
  attr,
  value,
  onChange,
  missing,
}: {
  id: string;
  attr: AdminSpecAttribute;
  value: string;
  onChange: (v: string) => void;
  missing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const opts = useMemo(() => {
    const nq = q.toLowerCase().trim();
    return [...attr.options]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((o) => !nq || o.labelRu.toLowerCase().includes(nq) || o.value.includes(nq) || o.aliases.some((x) => x.toLowerCase().includes(nq)));
  }, [attr.options, q]);
  const current = attr.options.find((o) => o.value === value);
  useEffect(() => setActive(0), [q]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
    setQ("");
    btnRef.current?.focus();
  }

  return (
    <>
      <button
        ref={btnRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "focusable flex h-10 items-center justify-between gap-2 rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 text-left text-[14px] hover:border-[var(--border-2)] pointer-coarse:h-11",
          open ? "!border-[var(--accent)] shadow-[var(--ring-accent)]" : missing ? "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]" : "border-[var(--line)]"
        )}
      >
        <span className={cn("truncate", current ? "text-[var(--text)]" : "text-[var(--text-faint)]")}>
          {current ? current.labelRu : value ? `«${value}» (нет в списке)` : `Выбрать · ${attr.options.length}`}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-faint)] transition-transform", open && "rotate-180")} />
      </button>
      <Popover open={open} anchorRef={btnRef} panelRef={panelRef} onClose={() => (setOpen(false), setQ(""))} maxHeight={320}>
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(opts.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && opts[active]) {
                e.preventDefault();
                pick(opts[active].value);
              }
            }}
            placeholder="Найти…"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
          {value && (
            <button type="button" onClick={() => pick("")} className="focusable flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] text-[12px] text-[var(--text-faint)] hover:text-[var(--text)]">
              <X className="h-3.5 w-3.5" /> сбросить
            </button>
          )}
        </div>
        <div role="listbox" className="thin-scroll min-h-0 flex-1 overflow-auto p-1">
          {opts.length === 0 && <div className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">Ничего не найдено</div>}
          {opts.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2 text-left text-[14px]",
                o.value === value ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent-hi)]" : i === active ? "bg-[var(--surface-hover)] text-[var(--text)]" : "text-[var(--text)]"
              )}
            >
              <span className="truncate">{o.labelRu}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
