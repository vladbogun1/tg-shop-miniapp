"use client";

/**
 * Attribute editor (a characteristic of a category, or a global one): labels ru/uk/en, key (latin
 * snake_case, auto-transliterated from the Russian label, locked once products use it), type,
 * units, group, storefront flags, facet buckets for numbers, the option list for enum/multi with
 * aliases, and a hint for the AI. Removing an option products use offers «объединить с…»
 * (rewrites their specs to another option) or a forced delete.
 */
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDown, ArrowUp, Check, GitMerge, Lock, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  adminApi,
  ApiError,
  type AdminSpecAttribute,
  type AdminSpecGroup,
  type SpecAttributeWriteRequest,
  type SpecType,
} from "@/lib/api";
import { isValidKey, keyFromLabel, optionValueFrom, plural, productsWord, SPEC_TYPE_LABEL } from "@/lib/catalog-admin";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Toggle } from "@/components/ui/Toggle";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { TagInput } from "./TagInput";

const CELL =
  "h-9 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[13px] text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-faint)] hover:border-[var(--border-2)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)] disabled:opacity-60";

interface OptRow {
  /** Stable React key. */
  uid: string;
  value: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
  aliases: string[];
  /** Value as stored (existing option) — renaming the slug of a used option is not allowed. */
  original?: string;
  usedCount?: number;
  valueTouched: boolean;
}

interface BucketRow {
  uid: string;
  min: string;
  max: string;
  labelRu: string;
  labelUk: string;
  labelEn: string;
}

interface Draft {
  labelRu: string;
  labelUk: string;
  labelEn: string;
  key: string;
  keyTouched: boolean;
  type: SpecType;
  unitRu: string;
  unitUk: string;
  unitEn: string;
  range: boolean;
  group: string;
  filterable: boolean;
  comparable: boolean;
  required: boolean;
  highlight: boolean;
  hint: string;
  options: OptRow[];
  buckets: BucketRow[];
}

let uidSeq = 0;
const uid = () => `r${++uidSeq}`;

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);

function parseNum(s: string): number | null {
  const t = s.replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** «до 45 г», «45–54 г», «65 г и больше» — the default bucket caption. */
function autoBucketLabel(min: number | null, max: number | null, unit: string, lang: "ru" | "uk" | "en"): string {
  const u = unit ? ` ${unit}` : "";
  if (min === null && max !== null) return lang === "en" ? `under ${fmt(max)}${u}` : `до ${fmt(max)}${u}`;
  if (max === null && min !== null)
    return lang === "en" ? `${fmt(min)}${u}+` : lang === "uk" ? `${fmt(min)}${u} і більше` : `${fmt(min)}${u} и больше`;
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}${u}`;
  return "";
}

function toDraft(a: AdminSpecAttribute | null, defaultGroup: string): Draft {
  return {
    labelRu: a?.labelRu ?? "",
    labelUk: a?.labelUk ?? "",
    labelEn: a?.labelEn ?? "",
    key: a?.key ?? "",
    keyTouched: !!a,
    type: a?.type ?? "enum",
    unitRu: a?.unitRu ?? "",
    unitUk: a?.unitUk ?? "",
    unitEn: a?.unitEn ?? "",
    range: a?.range ?? false,
    group: a?.group ?? defaultGroup,
    filterable: a?.filterable ?? true,
    comparable: a?.comparable ?? true,
    required: a?.required ?? false,
    highlight: a?.highlight ?? false,
    hint: a?.hint ?? "",
    options: (a?.options ?? [])
      .slice()
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((o) => ({
        uid: uid(),
        value: o.value,
        labelRu: o.labelRu,
        labelUk: o.labelUk,
        labelEn: o.labelEn,
        aliases: o.aliases,
        original: o.value,
        usedCount: o.usedCount,
        valueTouched: true,
      })),
    buckets: (a?.buckets ?? []).map((b) => ({
      uid: uid(),
      min: b.min === null ? "" : String(b.min),
      max: b.max === null ? "" : String(b.max),
      labelRu: b.labelRu,
      labelUk: b.labelUk,
      labelEn: b.labelEn,
    })),
  };
}

export function AttributeDialog({
  open,
  attribute,
  categoryId,
  categoryName,
  groups,
  takenKeys,
  highlightOthers,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = new attribute. */
  attribute: AdminSpecAttribute | null;
  /** Where a new attribute is created; null = global. */
  categoryId: string | null;
  categoryName: string;
  groups: AdminSpecGroup[];
  /** Keys already used on the category path (globals, parent, siblings of this one). */
  takenKeys: string[];
  /** How many OTHER attributes of the category path are «на карточке товара». */
  highlightOthers: number;
  onClose: () => void;
  onSaved: (a: AdminSpecAttribute) => void;
}) {
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.sortOrder - b.sortOrder), [groups]);
  const defaultGroup = sortedGroups.find((g) => g.key === "main")?.key ?? sortedGroups[0]?.key ?? "main";
  const [d, setD] = useState<Draft>(() => toDraft(attribute, defaultGroup));
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [mergeFor, setMergeFor] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [merging, setMerging] = useState(false);
  /** Options removed although products use them — the save then needs force. */
  const [forcedRemovals, setForcedRemovals] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    const fresh = toDraft(attribute, defaultGroup);
    setD(fresh);
    setInitial(JSON.stringify(fresh));
    setMergeFor(null);
    setForcedRemovals([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attribute]);

  const used = attribute?.usedCount ?? 0;
  const keyLocked = !!attribute && used > 0;
  const typeLocked = !!attribute && used > 0;
  const dirty = open && JSON.stringify(d) !== initial;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  // Key follows the Russian label until it is edited by hand.
  function setLabelRu(v: string) {
    setD((p) => ({ ...p, labelRu: v, key: p.keyTouched ? p.key : keyFromLabel(v) }));
  }

  const keyError = !d.key
    ? "Нужен ключ"
    : !isValidKey(d.key)
      ? "Только латиница a–z, цифры и _, с буквы"
      : takenKeys.includes(d.key) && d.key !== attribute?.key
        ? "Такой ключ уже есть в этой категории или выше по дереву"
        : undefined;

  const isChoice = d.type === "enum" || d.type === "multi";
  const optionErrors = useMemo(() => {
    if (!isChoice) return [] as string[];
    const errs: string[] = [];
    const seen = new Set<string>();
    d.options.forEach((o, i) => {
      if (!o.value || !/^[a-z0-9][a-z0-9_]*$/.test(o.value)) errs.push(`Опция ${i + 1}: значение — латиница, цифры, _`);
      else if (seen.has(o.value)) errs.push(`Опция ${i + 1}: значение «${o.value}» повторяется`);
      seen.add(o.value);
      if (!o.labelRu.trim()) errs.push(`Опция ${i + 1}: нет подписи ru`);
    });
    if (d.options.length === 0) errs.push("Добавьте хотя бы одну опцию");
    return errs;
  }, [d.options, isChoice]);

  const bucketErrors = useMemo(() => {
    if (d.type !== "number") return [] as string[];
    const errs: string[] = [];
    d.buckets.forEach((b, i) => {
      const min = parseNum(b.min);
      const max = parseNum(b.max);
      if (Number.isNaN(min) || Number.isNaN(max)) errs.push(`Диапазон ${i + 1}: не число`);
      else if (min === null && max === null) errs.push(`Диапазон ${i + 1}: задайте «от» или «до»`);
      else if (min !== null && max !== null && min > max) errs.push(`Диапазон ${i + 1}: «от» больше «до»`);
    });
    return errs;
  }, [d.buckets, d.type]);

  const labelsMissing = !d.labelRu.trim() || !d.labelUk.trim() || !d.labelEn.trim();
  const canSave = !labelsMissing && !keyError && optionErrors.length === 0 && bucketErrors.length === 0;
  const highlightOver = d.highlight && highlightOthers >= 3;

  function body(): SpecAttributeWriteRequest {
    return {
      categoryId: attribute ? attribute.categoryId : categoryId,
      key: d.key,
      labelRu: d.labelRu.trim(),
      labelUk: d.labelUk.trim(),
      labelEn: d.labelEn.trim(),
      type: d.type,
      unitRu: d.type === "number" ? d.unitRu.trim() || null : null,
      unitUk: d.type === "number" ? d.unitUk.trim() || null : null,
      unitEn: d.type === "number" ? d.unitEn.trim() || null : null,
      range: d.type === "number" && d.range,
      group: d.group,
      filterable: d.type === "text" ? false : d.filterable,
      comparable: d.comparable,
      required: d.required,
      highlight: d.highlight,
      sortOrder: attribute?.sortOrder ?? 0,
      hint: d.hint.trim() || null,
      buckets:
        d.type === "number" && d.buckets.length
          ? d.buckets.map((b) => {
              const min = parseNum(b.min);
              const max = parseNum(b.max);
              return {
                min,
                max,
                labelRu: b.labelRu.trim() || autoBucketLabel(min, max, d.unitRu, "ru"),
                labelUk: b.labelUk.trim() || autoBucketLabel(min, max, d.unitUk || d.unitRu, "uk"),
                labelEn: b.labelEn.trim() || autoBucketLabel(min, max, d.unitEn, "en"),
              };
            })
          : null,
      options: isChoice
        ? d.options.map((o, i) => ({
            value: o.value,
            labelRu: o.labelRu.trim(),
            labelUk: o.labelUk.trim() || o.labelRu.trim(),
            labelEn: o.labelEn.trim() || o.labelRu.trim(),
            aliases: o.aliases,
            sortOrder: (i + 1) * 10,
          }))
        : [],
    };
  }

  async function save(force = forcedRemovals.length > 0) {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = attribute
        ? await adminApi.updateSpecAttribute(attribute.id, body(), force)
        : await adminApi.createSpecAttribute(body());
      push(attribute ? "Характеристика сохранена" : "Характеристика добавлена", "ok");
      onSaved(saved);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && attribute && !force) {
        const ok = await confirm({
          title: "Опции используются в товарах",
          message: `${e.message}. Удалить их и вычистить значения из характеристик товаров? Лучше объединить опцию с другой — кнопка «Объединить» у опции.`,
          confirmLabel: "Удалить и вычистить",
          danger: true,
        });
        if (ok) {
          setSaving(false);
          await save(true);
          return;
        }
      } else {
        push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  function updateOpt(i: number, patch: Partial<OptRow>) {
    setD((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  }
  function moveOpt(i: number, to: number) {
    setD((p) => {
      if (to < 0 || to >= p.options.length) return p;
      const next = [...p.options];
      const [m] = next.splice(i, 1);
      next.splice(to, 0, m);
      return { ...p, options: next };
    });
  }
  function removeOpt(i: number) {
    const o = d.options[i];
    const inUse = !!o.original && (o.usedCount ?? (used > 0 ? -1 : 0)) !== 0;
    if (inUse) {
      setMergeFor(o.uid);
      setMergeTarget("");
      return;
    }
    setD((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }));
  }

  async function doMerge(o: OptRow) {
    if (!attribute || !o.original || !mergeTarget) return;
    setMerging(true);
    try {
      await adminApi.renameSpecOption(attribute.id, o.original, mergeTarget);
      const target = d.options.find((x) => x.value === mergeTarget);
      // The merged spelling keeps recognising: its label and aliases become aliases of the target.
      setD((p) => ({
        ...p,
        options: p.options
          .filter((x) => x.uid !== o.uid)
          .map((x) =>
            x.value === mergeTarget
              ? { ...x, aliases: [...new Set([...x.aliases, o.labelRu, o.value, ...o.aliases].filter(Boolean))] }
              : x
          ),
      }));
      setMergeFor(null);
      push(`«${o.labelRu}» объединена с «${target?.labelRu ?? mergeTarget}» — сохраните характеристику`, "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось объединить", "error");
    } finally {
      setMerging(false);
    }
  }

  function forceRemove(o: OptRow) {
    setForcedRemovals((p) => [...p, o.value]);
    setD((p) => ({ ...p, options: p.options.filter((x) => x.uid !== o.uid) }));
    setMergeFor(null);
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnBackdrop={false}
        dirty={dirty}
        title={attribute ? `Характеристика · ${attribute.labelRu}` : "Новая характеристика"}
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] text-[var(--text-faint)]">
              {categoryId || attribute?.categoryId ? `Категория «${categoryName}»` : "Глобальная — во всех категориях"}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Отмена
              </Button>
              <Button
                variant="accent"
                loading={saving}
                disabled={!canSave}
                icon={<Check className="h-4 w-4" />}
                onClick={() => save()}
              >
                {attribute ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {/* Labels */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Название</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="RU"
                autoFocus={!attribute}
                value={d.labelRu}
                maxLength={96}
                onChange={(e) => setLabelRu(e.target.value)}
                placeholder="Вес"
              />
              <Input label="UK" value={d.labelUk} maxLength={96} onChange={(e) => set("labelUk", e.target.value)} placeholder="Вага" />
              <Input label="EN" value={d.labelEn} maxLength={96} onChange={(e) => set("labelEn", e.target.value)} placeholder="Weight" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Input
                  label="Ключ"
                  value={d.key}
                  disabled={keyLocked}
                  maxLength={48}
                  className="font-mono"
                  onChange={(e) =>
                    setD((p) => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), keyTouched: true }))
                  }
                  error={keyLocked ? undefined : d.key || d.labelRu ? keyError : undefined}
                  hint={keyLocked ? undefined : "Латиница, snake_case. Хранится в товарах и в адресах фильтров."}
                  rightSlot={keyLocked ? <Lock className="h-3.5 w-3.5 text-[var(--text-faint)]" /> : undefined}
                />
                {keyLocked && (
                  <span className="text-[12px] text-[var(--text-faint)]">
                    Используется в {productsWord(used)} — ключ не меняется
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Select<SpecType>
                  label="Тип"
                  value={d.type}
                  onChange={(v) => !typeLocked && set("type", v)}
                  options={(Object.keys(SPEC_TYPE_LABEL) as SpecType[]).map((t) => ({ value: t, label: SPEC_TYPE_LABEL[t] }))}
                />
                {typeLocked && <span className="text-[12px] text-[var(--text-faint)]">Тип заполненной характеристики не меняется</span>}
              </div>
              <Select
                label="Группа"
                value={d.group}
                onChange={(v) => set("group", v)}
                options={
                  sortedGroups.length
                    ? sortedGroups.map((g) => ({ value: g.key, label: g.labelRu || g.key }))
                    : [{ value: "main", label: "Основное" }]
                }
              />
            </div>
            {!attribute && d.type === "text" && (
              <p className="text-[12px] text-[var(--text-faint)]">
                Текст — только для моделей и названий (Omron D2FC-F-7N): не переводится и не фильтруется.
              </p>
            )}
          </section>

          {/* Number: units + range */}
          <AnimatePresence initial={false}>
            {d.type === "number" && (
              <motion.section
                key="units"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-3 overflow-hidden"
              >
                <SectionTitle>Единица</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="RU" value={d.unitRu} maxLength={24} onChange={(e) => set("unitRu", e.target.value)} placeholder="г" />
                  <Input label="UK" value={d.unitUk} maxLength={24} onChange={(e) => set("unitUk", e.target.value)} placeholder="г" />
                  <Input label="EN" value={d.unitEn} maxLength={24} onChange={(e) => set("unitEn", e.target.value)} placeholder="g" />
                </div>
                <FlagCard>
                  <Toggle checked={d.range} onChange={(v) => set("range", v)} label="Диапазон «от–до»" />
                  <FlagHint>Значение — два числа (DPI 50–30 000). Фильтр ищет пересечение диапазонов.</FlagHint>
                </FlagCard>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Flags */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Где используется</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              <FlagCard>
                <Toggle
                  checked={d.type !== "text" && d.filterable}
                  disabled={d.type === "text"}
                  onChange={(v) => set("filterable", v)}
                  label="Фильтр на витрине"
                />
                <FlagHint>Фасет в «Фильтрах» Mini App и сайта.</FlagHint>
              </FlagCard>
              <FlagCard>
                <Toggle checked={d.comparable} onChange={(v) => set("comparable", v)} label="Для сравнения" />
                <FlagHint>Попадёт в будущее сравнение товаров.</FlagHint>
              </FlagCard>
              <FlagCard>
                <Toggle checked={d.required} onChange={(v) => set("required", v)} label="Обязательная" />
                <FlagHint>Без неё карточка считается «неполной».</FlagHint>
              </FlagCard>
              <FlagCard warn={highlightOver}>
                <Toggle checked={d.highlight} onChange={(v) => set("highlight", v)} label="На карточке товара" />
                <FlagHint>
                  {highlightOver
                    ? `Уже ${highlightOthers} в этой категории — в строку-сводку попадут только первые 3.`
                    : "Строка-сводка в сетке: «51 г · PAW3950 · 8000 Гц» (до 3)."}
                </FlagHint>
              </FlagCard>
            </div>
          </section>

          {/* Buckets */}
          {d.type === "number" && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Диапазоны фильтра</SectionTitle>
                <AddLink
                  onClick={() =>
                    setD((p) => ({
                      ...p,
                      buckets: [...p.buckets, { uid: uid(), min: "", max: "", labelRu: "", labelUk: "", labelEn: "" }],
                    }))
                  }
                >
                  Диапазон
                </AddLink>
              </div>
              {d.buckets.length === 0 ? (
                <p className="text-[12.5px] text-[var(--text-faint)]">
                  Без диапазонов фильтр — два поля «от–до». С диапазонами — чипы «до 45 г», «45–54 г»… Границы включительно.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <div aria-hidden className="field-label hidden grid-cols-[72px_72px_1fr_1fr_1fr_36px] gap-2 !text-[10.5px] !text-[var(--text-faint)] sm:grid">
                    <span>от</span>
                    <span>до</span>
                    <span>подпись RU</span>
                    <span>UK</span>
                    <span>EN</span>
                    <span />
                  </div>
                  {d.buckets.map((b, i) => {
                    const min = parseNum(b.min);
                    const max = parseNum(b.max);
                    const okNums = !Number.isNaN(min) && !Number.isNaN(max);
                    const upd = (patch: Partial<BucketRow>) =>
                      setD((p) => ({ ...p, buckets: p.buckets.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                    return (
                      <motion.div
                        layout
                        key={b.uid}
                        className="grid grid-cols-[1fr_1fr_36px] gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-2 sm:grid-cols-[72px_72px_1fr_1fr_1fr_36px] sm:border-0 sm:p-0"
                      >
                        <input className={cn(CELL, "tabular")} inputMode="decimal" aria-label="от" placeholder="от" value={b.min} onChange={(e) => upd({ min: e.target.value })} />
                        <input className={cn(CELL, "tabular")} inputMode="decimal" aria-label="до" placeholder="до" value={b.max} onChange={(e) => upd({ max: e.target.value })} />
                        <RemoveBtn label="Удалить диапазон" onClick={() => setD((p) => ({ ...p, buckets: p.buckets.filter((_, j) => j !== i) }))} className="sm:order-last" />
                        {(["labelRu", "labelUk", "labelEn"] as const).map((k, li) => (
                          <input
                            key={k}
                            className={cn(CELL, "col-span-3 sm:col-span-1")}
                            aria-label={`подпись ${["RU", "UK", "EN"][li]}`}
                            value={b[k]}
                            placeholder={okNums ? autoBucketLabel(min, max, li === 2 ? d.unitEn : li === 1 ? d.unitUk || d.unitRu : d.unitRu, (["ru", "uk", "en"] as const)[li]) || ["RU", "UK", "EN"][li] : ""}
                            onChange={(e) => upd({ [k]: e.target.value } as Partial<BucketRow>)}
                          />
                        ))}
                      </motion.div>
                    );
                  })}
                  <p className="text-[12px] text-[var(--text-faint)]">Пустая подпись — подставится по границам (как в подсказке).</p>
                </div>
              )}
              <Errors list={bucketErrors} />
            </section>
          )}

          {/* Options */}
          {isChoice && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>
                  Опции <span className="tabular text-[var(--text-faint)]">· {d.options.length}</span>
                </SectionTitle>
                <AddLink
                  onClick={() =>
                    setD((p) => ({
                      ...p,
                      options: [
                        ...p.options,
                        { uid: uid(), value: "", labelRu: "", labelUk: "", labelEn: "", aliases: [], valueTouched: false },
                      ],
                    }))
                  }
                >
                  Опция
                </AddLink>
              </div>
              {d.options.length === 0 && (
                <p className="text-[12.5px] text-[var(--text-faint)]">
                  Значения, из которых выбирают (сенсоры, свитчи, подключение…). Значение — латинский slug, он хранится в товаре.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {d.options.map((o, i) => {
                    const locked = !!o.original && (o.usedCount ?? (used > 0 ? 1 : 0)) > 0;
                    return (
                      <motion.div
                        key={o.uid}
                        layout
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--bg-2)] p-2.5"
                      >
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[120px_1fr_1fr_1fr]">
                          <input
                            className={cn(CELL, "font-mono")}
                            aria-label={`Опция ${i + 1}: значение`}
                            placeholder="value"
                            value={o.value}
                            disabled={locked}
                            title={locked ? "Опция используется в товарах — значение не меняется" : undefined}
                            onChange={(e) =>
                              updateOpt(i, { value: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"), valueTouched: true })
                            }
                          />
                          <input
                            className={CELL}
                            aria-label={`Опция ${i + 1}: подпись RU`}
                            placeholder="RU"
                            value={o.labelRu}
                            onChange={(e) =>
                              updateOpt(i, {
                                labelRu: e.target.value,
                                ...(o.valueTouched ? {} : { value: optionValueFrom(e.target.value) }),
                              })
                            }
                          />
                          <input className={CELL} aria-label={`Опция ${i + 1}: подпись UK`} placeholder="UK" value={o.labelUk} onChange={(e) => updateOpt(i, { labelUk: e.target.value })} />
                          <input className={CELL} aria-label={`Опция ${i + 1}: подпись EN`} placeholder="EN" value={o.labelEn} onChange={(e) => updateOpt(i, { labelEn: e.target.value })} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 sm:flex-nowrap">
                          <span className="field-label shrink-0 !text-[10.5px] !text-[var(--text-faint)]">Алиасы</span>
                          <TagInput
                            dense
                            className="min-w-[180px] flex-1"
                            ariaLabel={`Опция ${i + 1}: алиасы`}
                            value={o.aliases}
                            onChange={(v) => updateOpt(i, { aliases: v })}
                            placeholder="другие написания: paw 3950, 3950…"
                          />
                          {o.usedCount != null && o.usedCount > 0 && (
                            <span className="tabular shrink-0 text-[11.5px] text-[var(--text-faint)]">{productsWord(o.usedCount)}</span>
                          )}
                          <div className="ml-auto flex shrink-0 items-center gap-1">
                            <MiniBtn label="Выше" disabled={i === 0} onClick={() => moveOpt(i, i - 1)}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </MiniBtn>
                            <MiniBtn label="Ниже" disabled={i === d.options.length - 1} onClick={() => moveOpt(i, i + 1)}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </MiniBtn>
                            <RemoveBtn label={`Удалить опцию ${o.labelRu || i + 1}`} onClick={() => removeOpt(i)} />
                          </div>
                        </div>
                        <AnimatePresence>
                          {mergeFor === o.uid && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] p-2.5">
                                <p className="flex items-start gap-2 text-[12.5px] leading-snug text-[var(--text)]">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
                                  {o.usedCount && o.usedCount > 0
                                    ? `Опция выбрана в ${productsWord(o.usedCount)}.`
                                    : "Опция может быть выбрана в товарах."}{" "}
                                  Объедините её с другой — товары перейдут на неё, а написание станет алиасом.
                                </p>
                                <div className="mt-2 flex flex-wrap items-end gap-2">
                                  <Select
                                    className="min-w-[200px] flex-1"
                                    value={mergeTarget}
                                    onChange={setMergeTarget}
                                    placeholder="Объединить с…"
                                    options={d.options
                                      .filter((x) => x.uid !== o.uid && x.original)
                                      .map((x) => ({ value: x.value, label: `${x.labelRu} (${x.value})` }))}
                                  />
                                  <Button size="sm" variant="surface" icon={<GitMerge className="h-3.5 w-3.5" />} disabled={!mergeTarget} loading={merging} onClick={() => doMerge(o)}>
                                    Объединить
                                  </Button>
                                  <Button size="sm" variant="danger" onClick={() => forceRemove(o)}>
                                    Удалить всё равно
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setMergeFor(null)}>
                                    Отмена
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {forcedRemovals.length > 0 && (
                <p className="text-[12px] text-[var(--danger-ink)]">
                  При сохранении значения {forcedRemovals.map((v) => `«${v}»`).join(", ")} будут вычищены из товаров.
                </p>
              )}
              <Errors list={d.options.some((o) => o.value || o.labelRu) || d.options.length === 0 ? optionErrors : []} />
            </section>
          )}

          <Textarea
            label="Подсказка для ИИ"
            rows={2}
            value={d.hint}
            onChange={(e) => set("hint", e.target.value)}
            placeholder="Как заполнять: «без учёта кабеля; „57 ± 3 г“ → 57»"
            hint="Попадает в промпт «Карточек». На витрине не показывается."
          />
          {labelsMissing && (d.labelRu || d.labelUk || d.labelEn) && (
            <p className="text-[12px] text-[var(--text-faint)]">Нужны подписи на трёх языках.</p>
          )}
          {attribute && used > 0 && (
            <p className="text-[12px] text-[var(--text-faint)]">
              Заполнена в {productsWord(used)}. Удаление характеристики вычистит её из {plural(used, "этого товара", "этих товаров", "этих товаров")}.
            </p>
          )}
        </div>
      </Modal>
      {confirmUi}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="section-title !text-[13px] text-[var(--ink)]">{children}</h3>;
}

function FlagCard({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-[var(--r-md)] border bg-[var(--surface-2)] p-3",
        warn ? "border-[color-mix(in_srgb,var(--warn)_45%,transparent)]" : "border-[var(--line)]"
      )}
    >
      {children}
    </div>
  );
}

function FlagHint({ children }: { children: React.ReactNode }) {
  return <span className="pl-14 text-[12px] leading-snug text-[var(--text-faint)]">{children}</span>;
}

function AddLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focusable hit font-display flex items-center gap-1 rounded-[var(--r-sm)] text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] transition-colors hover:underline"
    >
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function MiniBtn({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RemoveBtn({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger-ink)]",
        className
      )}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function Errors({ list }: { list: string[] }) {
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-[12px] text-[var(--danger-ink)]">
      {list.slice(0, 4).map((e) => (
        <li key={e} className="flex items-center gap-1.5">
          <X className="h-3 w-3 shrink-0" />
          {e}
        </li>
      ))}
      {list.length > 4 && <li>…и ещё {list.length - 4}</li>}
    </ul>
  );
}
