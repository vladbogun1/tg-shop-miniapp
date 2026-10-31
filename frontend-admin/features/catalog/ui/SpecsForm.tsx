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
import { useEffect, useMemo, useState } from "react";
import type { CardMeta, ProductSpecs, SpecValue } from "@/lib/api";
import { cn } from "@/lib/cn";
import { groupAttributes, isSpecEmpty } from "../model/attributes";
import { parseNum } from "../model/attribute-draft";
import { isNumberBad, isRangeBad, isWideField, rawFromSpecs } from "../model/spec-input";
import type { AdminSpecAttribute, AdminSpecGroup } from "../model/types";
import { ConfidenceDot } from "./CardBits";
import { Chips, OptionPicker, TriState } from "./spec-inputs";

const FIELD =
  "h-10 w-full min-w-0 bg-transparent px-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] pointer-coarse:h-11";
const BOX =
  "flex items-center rounded-[var(--r-md)] border bg-[var(--surface-2)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--border-2)] focus-within:!border-[var(--accent)] focus-within:shadow-[var(--ring-accent)]";
const WARN_BORDER = "border-[color-mix(in_srgb,var(--warn)_55%,transparent)]";

type FieldMeta = NonNullable<CardMeta["fields"]>[string];

/** Рамка поля: ошибка, «не заполнено обязательное» или обычная. */
const boxBorder = (bad: boolean, missing: boolean) => (bad ? "!border-[var(--danger)]" : missing ? WARN_BORDER : "border-[var(--line)]");

function UnitSuffix({ unit }: { unit: string | null | undefined }) {
  return unit ? <span className="shrink-0 pr-3 text-[13px] text-[var(--text-faint)]">{unit}</span> : null;
}

interface InputsProps {
  a: AdminSpecAttribute;
  id: string;
  raw: Record<string, string>;
  bad: boolean;
  missing: boolean;
  onNumber: (a: AdminSpecAttribute, text: string) => void;
  onRange: (a: AdminSpecAttribute, side: "min" | "max", text: string) => void;
}

function NumberInput({ a, id, raw, bad, missing, onNumber }: InputsProps) {
  return (
    <div className={cn(BOX, boxBorder(bad, missing))}>
      <input
        id={id}
        inputMode="decimal"
        className={cn(FIELD, "tabular")}
        value={raw[a.key] ?? ""}
        placeholder="—"
        onChange={(e) => onNumber(a, e.target.value)}
      />
      <UnitSuffix unit={a.unitRu} />
    </div>
  );
}

function RangeInput({ a, id, raw, bad, missing, onRange }: InputsProps) {
  const border = cn(BOX, "flex-1", boxBorder(bad, missing));
  return (
    <div className="flex items-center gap-2">
      <div className={border}>
        <span className="shrink-0 pl-3 text-[12px] text-[var(--text-faint)]">от</span>
        <input id={id} inputMode="decimal" aria-label={`${a.labelRu}: от`} className={cn(FIELD, "tabular pl-2")} value={raw[`${a.key}.min`] ?? ""} placeholder="—" onChange={(e) => onRange(a, "min", e.target.value)} />
      </div>
      <div className={border}>
        <span className="shrink-0 pl-3 text-[12px] text-[var(--text-faint)]">до</span>
        <input inputMode="decimal" aria-label={`${a.labelRu}: до`} className={cn(FIELD, "tabular pl-2")} value={raw[`${a.key}.max`] ?? ""} placeholder="—" onChange={(e) => onRange(a, "max", e.target.value)} />
        <UnitSuffix unit={a.unitRu} />
      </div>
    </div>
  );
}

interface ControlProps extends InputsProps {
  v: SpecValue | undefined;
  setValue: (key: string, v: SpecValue | undefined) => void;
}

/** Поле ввода под тип характеристики. */
function SpecControl(p: ControlProps) {
  const { a, id, v, missing, setValue } = p;
  switch (a.type) {
    case "number":
      return a.range ? <RangeInput {...p} /> : <NumberInput {...p} />;
    case "text":
      return (
        <div className={cn(BOX, missing ? WARN_BORDER : "border-[var(--line)]")}>
          <input
            id={id}
            className={FIELD}
            value={typeof v === "string" ? v : ""}
            placeholder="—"
            maxLength={255}
            onChange={(e) => setValue(a.key, e.target.value === "" ? undefined : e.target.value)}
          />
        </div>
      );
    case "bool":
      return <TriState id={id} value={typeof v === "boolean" ? v : null} onChange={(b) => setValue(a.key, b === null ? undefined : b)} missing={missing} />;
    case "enum":
      return a.options.length <= 8 ? (
        <Chips id={id} attr={a} selected={typeof v === "string" ? [v] : []} onToggle={(val) => setValue(a.key, v === val ? undefined : val)} single missing={missing} />
      ) : (
        <OptionPicker id={id} attr={a} value={typeof v === "string" ? v : ""} onChange={(val) => setValue(a.key, val || undefined)} missing={missing} />
      );
    case "multi":
      return (
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
      );
    default:
      return null;
  }
}

interface FieldProps {
  a: AdminSpecAttribute;
  v: SpecValue | undefined;
  raw: Record<string, string>;
  conf: FieldMeta | undefined;
  highlightMissing: boolean;
  onClear: (a: AdminSpecAttribute) => void;
  onNumber: InputsProps["onNumber"];
  onRange: InputsProps["onRange"];
  setValue: ControlProps["setValue"];
}

function SpecFieldLabel({ a, empty, conf, onClear, id }: { a: AdminSpecAttribute; empty: boolean; conf: FieldMeta | undefined; onClear: () => void; id: string }) {
  return (
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
            onClick={onClear}
            aria-label={`Очистить «${a.labelRu}»`}
            className="focusable ml-auto shrink-0 rounded-[var(--r-sm)] px-1 text-[11.5px] text-[var(--text-faint)] hover:text-[var(--text)]"
          >
            очистить
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Под полем: ошибка ввода, значение не из списка или подсказка. */
function SpecFieldNotes({ a, v, numBad, rangeBad }: { a: AdminSpecAttribute; v: SpecValue | undefined; numBad: boolean; rangeBad: boolean }) {
  const unknownOption = typeof v === "string" && a.type === "enum" && !a.options.some((o) => o.value === v);
  return (
    <>
      {(numBad || rangeBad) && <span className="text-[12px] text-[var(--danger-ink)]">{numBad ? "Нужно число" : "«От» больше «до» или не число"}</span>}
      {unknownOption && <span className="text-[12px] text-[var(--warn)]">Значение «{String(v)}» не из списка — при сохранении отбросится</span>}
      {a.hint && !numBad && !rangeBad && (
        <span className="line-clamp-1 text-[11.5px] text-[var(--text-faint)]" title={a.hint}>
          {a.hint}
        </span>
      )}
    </>
  );
}

function SpecField({ a, v, raw, conf, highlightMissing, onClear, onNumber, onRange, setValue }: FieldProps) {
  const empty = isSpecEmpty(v);
  const missing = highlightMissing && a.required && empty;
  const id = `spec-${a.key}`;
  const rangeBad = isRangeBad(a, raw[`${a.key}.min`] ?? "", raw[`${a.key}.max`] ?? "");
  const numBad = isNumberBad(a, raw[a.key] ?? "");
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", isWideField(a) && "sm:col-span-2")}>
      <SpecFieldLabel a={a} empty={empty} conf={conf} onClear={() => onClear(a)} id={id} />
      <SpecControl a={a} id={id} raw={raw} bad={numBad || rangeBad} missing={missing} onNumber={onNumber} onRange={onRange} v={v} setValue={setValue} />
      <SpecFieldNotes a={a} v={v} numBad={numBad} rangeBad={rangeBad} />
    </div>
  );
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
            {g.items.map((a) => (
              <SpecField
                key={a.key}
                a={a}
                v={specs[a.key]}
                raw={raw}
                conf={meta?.fields?.[a.key]}
                highlightMissing={!!highlightMissing}
                onClear={clear}
                onNumber={onNumber}
                onRange={onRange}
                setValue={setValue}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
