"use client";

/**
 * «Оформление с ИИ»: 1) choose products → prompt in batches → 2) paste the answer →
 * 3) review field by field → import. The prompt lives in lib/card-prompt.ts, parsing and the
 * schema checks in lib/card-check.ts (the backend re-validates everything on import).
 */
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ClipboardPaste, PartyPopper, Save, Search, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { buildCardReview, editText, parseCardAnswer, type Proposal, type ProductReview } from "@/lib/card-check";
import {
  buildCardPrompt,
  categoryPathName,
  splitIntoBatches,
  type CardItem,
  type CardSchema,
} from "@/lib/card-prompt";
import { cardsApi, type CardImportItem, type CardImportResult } from "@/lib/cards-api";
import { invalidateCards } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import { CopyButton } from "@/components/translations/shared";
import { AddOptionModal } from "@/components/cards/AddOptionModal";
import { ReviewCard } from "@/components/cards/ReviewCard";
import { buildImportItem, defaultSel, mergeSel, type ProductSel } from "@/components/cards/selection";
import { CardStatusChip, Check, ConfidencePill, Step, Thumb } from "@/components/cards/shared";

type Mode = "unfinished" | "draft" | "incomplete" | "lowconf" | "all" | "manual";
type ReviewFilter = "all" | "ok" | "warn" | "error";

/** AI-filled cards below this overall confidence are offered for another pass. */
const LOW_CONFIDENCE = 60;

const REASON_RU: Record<string, string> = {
  NOT_FOUND: "товар не найден",
  PRODUCT_NOT_FOUND: "товар не найден",
  UNKNOWN_CATEGORY: "нет такой категории",
  CATEGORY_NOT_FOUND: "нет такой категории",
  CATEGORY_NOT_LEAF: "категория не лист",
  NOT_LEAF: "категория не лист",
  UNKNOWN_KEY: "нет такого ключа в схеме",
  UNKNOWN_OPTION: "нет такой опции",
  NOT_A_NUMBER: "не число",
  OUT_OF_RANGE: "число вне допустимого",
  MIN_GT_MAX: "min больше max",
  EMPTY: "пустое значение",
  INVALID: "некорректное значение",
  NOTHING_TO_APPLY: "нечего применять",
};
const reasonRu = (r: string) => REASON_RU[r] ?? REASON_RU[r?.toUpperCase?.()] ?? r;

export function AiCards({ items, schema, ids }: { items: CardItem[]; schema: CardSchema; ids: Map<string, string> }) {
  const qc = useQueryClient();
  const { push } = useToast();

  // ---- 1. selection + prompt ------------------------------------------------
  // Hidden unfinished products first (they are not on sale until completed), else the backlog.
  const [mode, setMode] = useState<Mode>(() => (items.some((i) => i.unfinished === true) ? "unfinished" : "draft"));
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [size, setSize] = useState<"4" | "8">("8");
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<number | null>(null);

  const sortKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) m.set(it.id, `${categoryPathName(schema, it.categorySlug) || "я"}\u0000${it.title}`);
    return m;
  }, [items, schema]);
  const sorted = useMemo(() => [...items].sort((a, b) => sortKey.get(a.id)!.localeCompare(sortKey.get(b.id)!, "ru")), [items, sortKey]);

  const pools = useMemo(
    () => ({
      unfinished: sorted.filter((i) => i.unfinished === true),
      draft: sorted.filter((i) => (i.cardStatus ?? "DRAFT") === "DRAFT" && i.unfinished !== true),
      incomplete: sorted.filter((i) => (i.missingRequired?.length ?? 0) > 0),
      lowconf: sorted.filter((i) => i.cardStatus === "AI_FILLED" && (i.cardConfidence ?? 0) < LOW_CONFIDENCE),
      all: sorted,
    }),
    [sorted]
  );
  const candidates = mode === "manual" ? sorted : pools[mode];
  const chosen = useMemo(
    () => (mode === "manual" ? sorted.filter((i) => manual.has(i.id)) : pools[mode].filter((i) => !excluded.has(i.id))),
    [mode, sorted, manual, pools, excluded]
  );
  const visibleList = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    return q ? candidates.filter((i) => `${i.title} ${i.brand ?? ""} ${i.categorySlug ?? ""}`.toLocaleLowerCase("ru").includes(q)) : candidates;
  }, [candidates, query]);

  const batches = useMemo(() => {
    const split = splitIntoBatches(chosen, Number(size));
    return split.map((b, i) => ({
      items: b,
      pids: b.map((x) => ids.get(x.id)!),
      text: buildCardPrompt(b, schema, { part: i + 1, total: split.length, ids }),
    }));
  }, [chosen, size, schema, ids]);
  const nextBatch = batches.findIndex((_, i) => !copied.has(i));
  const chosenKey = chosen.map((c) => c.id).join(",") + "|" + size;
  const prevKey = useRef(chosenKey);
  useEffect(() => {
    // Another selection = other batches: the "copied" marks no longer mean anything.
    if (prevKey.current !== chosenKey) {
      prevKey.current = chosenKey;
      setCopied(new Set());
      setPreview(null);
    }
  }, [chosenKey]);

  function isChosen(id: string) {
    return mode === "manual" ? manual.has(id) : !excluded.has(id);
  }
  function setChosen(id: string, on: boolean) {
    if (mode === "manual") {
      const n = new Set(manual);
      if (on) n.add(id);
      else n.delete(id);
      setManual(n);
    } else {
      const n = new Set(excluded);
      if (on) n.delete(id);
      else n.add(id);
      setExcluded(n);
    }
  }

  // ---- 2. answer ---------------------------------------------------------------
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<{ id: string; problems: string[] }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ProductReview[] | null>(null);
  const [sel, setSel] = useState<Map<string, ProductSel>>(new Map());

  function check(text = answer, keepSelection = false) {
    const parsed = parseCardAnswer(text);
    setParseErrors(parsed.errors);
    setNotes(parsed.notes);
    if (!text.trim() || parsed.entries.size === 0) {
      setReviews(null);
      setUnknown([]);
      setInvalid([]);
      setMissing([]);
      return;
    }
    const r = buildCardReview(parsed, { schema, items, ids });
    setUnknown(r.unknown);
    setInvalid(r.invalid);
    const answered = new Set(r.products.map((p) => p.id));
    const miss: string[] = [];
    for (const b of batches) if (b.pids.some((p) => answered.has(p))) miss.push(...b.pids.filter((p) => !answered.has(p)));
    setMissing(miss);
    setReviews(r.products);
    setSel((prev) => {
      const next = new Map<string, ProductSel>();
      for (const p of r.products) {
        // After a schema change keep what the admin chose, but let newly valid fields in.
        next.set(p.id, mergeSel(keepSelection ? prev.get(p.id) : undefined, p));
      }
      return next;
    });
    setSummary(null);
  }

  // A new option was added to the schema → re-check the same answer against it.
  const schemaRef = useRef(schema);
  useEffect(() => {
    if (schemaRef.current !== schema) {
      schemaRef.current = schema;
      if (reviews && answer.trim()) check(answer, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  // ---- 3. review -----------------------------------------------------------------
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [replaceSpecs, setReplaceSpecs] = useState(false);
  const [markReady, setMarkReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<{ result?: CardImportResult; error?: string; titles: Map<string, string> } | null>(null);
  const [addOption, setAddOption] = useState<Proposal | null>(null);

  const counts = useMemo(() => {
    const r = reviews ?? [];
    return { ok: r.filter((x) => x.level === "ok").length, warn: r.filter((x) => x.level === "warn").length, error: r.filter((x) => x.level === "error").length };
  }, [reviews]);
  const visibleReviews = useMemo(
    () => (reviews ?? []).filter((r) => reviewFilter === "all" || r.level === reviewFilter),
    [reviews, reviewFilter]
  );

  const payload = (reviews ?? []).map((r) => buildImportItem(r, sel.get(r.id), { markReady, model })).filter((x): x is CardImportItem => !!x);

  function patchSel(id: string, patch: Partial<ProductSel>) {
    setSel((prev) => {
      const n = new Map(prev);
      const cur = n.get(id);
      if (cur) n.set(id, { ...cur, ...patch });
      return n;
    });
  }
  function bulk(kind: "80" | "okwarn" | "none") {
    setSel((prev) => {
      const n = new Map(prev);
      for (const r of reviews ?? []) {
        const def = defaultSel(r);
        if (kind === "none") n.set(r.id, { ...(n.get(r.id) ?? def), on: false });
        else if (kind === "okwarn") n.set(r.id, def);
        else {
          const on = r.level !== "error" && (r.overall ?? 0) >= 80;
          n.set(r.id, {
            ...def,
            on,
            fields: new Set(r.fields.filter((f) => f.value !== undefined && f.level !== "error" && (f.confidence ?? 0) >= 80).map((f) => f.key)),
          });
        }
      }
      return n;
    });
  }

  async function send() {
    if (!reviews || sending || !payload.length) return;
    const titles = new Map(reviews.map((r) => [r.item.id, r.item.title]));
    setSending(true);
    try {
      const result = await cardsApi.import({ items: payload, replaceSpecs });
      setSummary({ result, titles });
      const rejected = new Set(result.rejected.map((x) => x.productId));
      const sent = new Set(payload.map((p) => p.productId).filter((id) => !rejected.has(id)));
      setReviews((prev) => (prev ?? []).filter((r) => !sent.has(r.item.id)));
      push(`Сохранено карточек: ${result.applied}${result.rejected.length ? `, отклонено: ${result.rejected.length}` : ""}`, result.rejected.length ? "error" : "ok");
    } catch (e) {
      setSummary({ error: e instanceof ApiError ? e.message : "ошибка сети", titles });
      push("Не удалось сохранить — см. итог", "error");
    } finally {
      setSending(false);
      invalidateCards(qc);
    }
  }

  if (!items.length) {
    return <EmptyState icon={PartyPopper} title="Товаров нет" description="Добавьте товары — и их карточки можно будет оформить здесь." />;
  }

  const modeOptions = [
    { value: "unfinished" as const, label: "Незавершённые", count: pools.unfinished.length },
    { value: "draft" as const, label: "Без оформления (на витрине)", count: pools.draft.length },
    { value: "incomplete" as const, label: "Неполные", count: pools.incomplete.length },
    { value: "lowconf" as const, label: `От ИИ < ${LOW_CONFIDENCE} %`, count: pools.lowconf.length },
    { value: "all" as const, label: "Все", count: pools.all.length },
    { value: "manual" as const, label: "Вручную", count: manual.size || undefined },
  ];

  return (
    <div>
      {/* ---- Step 1 ---- */}
      <Step
        n={1}
        title="Товары и промпт"
        aside={
          <SegmentedControl<Mode>
            size="sm"
            value={mode}
            onChange={(v) => {
              setMode(v);
              if (v === "manual") setShowList(true);
            }}
            options={modeOptions}
          />
        }
      >
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Скопируйте промпт в чат с ИИ, у которого есть поиск в интернете (ChatGPT, Claude, Gemini, Perplexity…), дождитесь ответа одним
          блоком кода и вставьте его ниже. Выбрано <b className="text-[var(--text)]">{chosen.length}</b> товаров →{" "}
          <b className="text-[var(--text)]">{batches.length}</b> {batches.length === 1 ? "пакет" : "пакетов"} по {size}.
          {batches.length > 1 && " Отправляйте пакеты по очереди — каждый в новом чате: ИИ ищет данные по каждому товару, большие пакеты он делает хуже."}
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowList(!showList)}
            iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", showList && "rotate-180")} />}
          >
            {showList ? "Скрыть список" : mode === "manual" ? "Выбрать товары" : "Показать список"}
          </Button>
          <span className="field-label !text-[11px]">Товаров в пакете</span>
          <SegmentedControl<"4" | "8">
            size="sm"
            value={size}
            onChange={setSize}
            options={[
              { value: "4", label: "4" },
              { value: "8", label: "8" },
            ]}
          />
          {mode !== "manual" && excluded.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setExcluded(new Set())}>
              Вернуть исключённые ({excluded.size})
            </Button>
          )}
          {mode === "manual" && manual.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setManual(new Set())}>
              Снять выбор
            </Button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {showList && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mb-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)]">
                <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
                  <Search className="h-4 w-4 text-[var(--text-faint)]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Поиск по названию, бренду, категории"
                    aria-label="Поиск товаров"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!visibleList.length}
                    onClick={() => {
                      if (mode === "manual") setManual(new Set([...manual, ...visibleList.map((i) => i.id)]));
                      else {
                        const n = new Set(excluded);
                        visibleList.forEach((i) => n.delete(i.id));
                        setExcluded(n);
                      }
                    }}
                  >
                    Отметить все
                  </Button>
                </div>
                <ul className="thin-scroll max-h-[340px] overflow-auto">
                  {visibleList.length === 0 && <li className="px-3 py-3 text-[13px] text-[var(--text-faint)]">Ничего не найдено.</li>}
                  {visibleList.map((i) => (
                    <li key={i.id}>
                      <label className="flex cursor-pointer items-center gap-3 border-b border-[var(--line)] px-3 py-1.5 last:border-b-0 hover:bg-[var(--surface-hover)]">
                        <Check checked={isChosen(i.id)} onChange={(on) => setChosen(i.id, on)} label={`Выбрать ${i.title}`} />
                        <Thumb src={i.imageUrl} alt={i.title} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-[var(--text)]">{i.title}</span>
                          <span className="block truncate text-[11.5px] text-[var(--text-faint)]">
                            {categoryPathName(schema, i.categorySlug) || "без категории"}
                            {i.brand ? ` · ${i.brand}` : ""}
                            {(i.missingRequired?.length ?? 0) > 0 ? ` · не заполнено: ${i.missingRequired!.length}` : ""}
                          </span>
                        </span>
                        {i.cardStatus === "AI_FILLED" && <ConfidencePill value={i.cardConfidence ?? null} />}
                        <CardStatusChip status={i.cardStatus} />
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {chosen.length === 0 ? (
          <div className="text-[13px] font-semibold text-[var(--text-faint)]">
            {mode === "manual" ? "Отметьте товары в списке." : "По этому фильтру товаров нет."}
          </div>
        ) : batches.length === 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton
              variant={copied.has(0) || answer.trim() ? "surface" : "accent"}
              text={batches[0].text}
              copied={copied.has(0)}
              onCopied={() => setCopied(new Set(copied).add(0))}
            />
            {copied.has(0) && <Badge tone="ok">скопирован</Badge>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreview(preview === 0 ? null : 0)}
              iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview === 0 && "rotate-180")} />}
            >
              Показать текст
            </Button>
            <span className="text-[12px] text-[var(--text-faint)]">{batches[0].text.length.toLocaleString("ru")} симв.</span>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {batches.map((b, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--line)] p-3",
                  copied.has(i) ? "border-[color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color-mix(in_srgb,var(--ok)_8%,var(--surface-2))]" : "bg-[var(--surface-2)]"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="section-title">
                    Пакет {i + 1} из {batches.length}
                  </span>
                  {copied.has(i) && <Badge tone="ok">скопирован</Badge>}
                </div>
                <div className="line-clamp-2 text-[12px] text-[var(--text-muted)]" title={b.items.map((x) => x.title).join("\n")}>
                  {b.items.map((x) => x.title).join(" · ")}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <CopyButton
                    variant={i === nextBatch ? "accent" : "surface"}
                    text={b.text}
                    copied={copied.has(i)}
                    onCopied={() => setCopied(new Set(copied).add(i))}
                    label={`Скопировать пакет ${i + 1}`}
                  />
                  <Button variant="ghost" size="sm" onClick={() => setPreview(preview === i ? null : i)}>
                    {preview === i ? "Скрыть" : "Текст"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {preview != null && batches[preview] && (
            <motion.pre
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="thin-scroll mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]"
            >
              {batches[preview].text}
            </motion.pre>
          )}
        </AnimatePresence>
      </Step>

      {/* ---- Step 2 ---- */}
      <Step n={2} title="Ответ ИИ">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            const el = e.currentTarget;
            const next = answer.slice(0, el.selectionStart) + pasted + answer.slice(el.selectionEnd);
            window.setTimeout(() => check(next), 0);
          }}
          rows={7}
          spellCheck={false}
          aria-label="Ответ ИИ"
          placeholder={'Вставьте сюда ответ целиком — блок ```json { "p…": { "specs": …, "confidence": …, … } } ```.\nМожно вставить ответы на несколько пакетов подряд.'}
          className="thin-scroll w-full resize-y rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant={reviews || !answer.trim() ? "surface" : "accent"} icon={<Wand2 className="h-4 w-4" />} onClick={() => check()} disabled={!answer.trim()}>
            Проверить
          </Button>
          <Button
            variant="outline"
            icon={<ClipboardPaste className="h-4 w-4" />}
            onClick={async () => {
              try {
                const t = await navigator.clipboard.readText();
                setAnswer(t);
                check(t);
              } catch {
                push("Браузер не дал прочитать буфер — вставьте Ctrl+V", "info");
              }
            }}
          >
            Вставить из буфера
          </Button>
          {answer && (
            <Button
              variant="ghost"
              icon={<X className="h-4 w-4" />}
              onClick={() => {
                setAnswer("");
                setReviews(null);
                setParseErrors([]);
                setNotes([]);
                setUnknown([]);
                setInvalid([]);
                setMissing([]);
                setSummary(null);
              }}
            >
              Очистить
            </Button>
          )}
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Модель ИИ (необязательно)"
            aria-label="Модель ИИ"
            className="ml-auto h-10 w-full min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] sm:w-[240px]"
          />
        </div>

        {(parseErrors.length > 0 || notes.length > 0 || unknown.length > 0 || invalid.length > 0 || missing.length > 0) && (
          <div className="mt-3 flex flex-col gap-1.5 text-[13px] font-semibold">
            {parseErrors.map((e, i) => (
              <div key={i} className="text-[var(--danger-ink)]">✕ {e}</div>
            ))}
            {unknown.length > 0 && (
              <div className="text-[var(--danger-ink)]">
                ✕ Неизвестные id ({unknown.length}) — исключены (ИИ исказил id или товара больше нет):{" "}
                <span className="font-mono">{unknown.slice(0, 12).join(", ")}{unknown.length > 12 ? "…" : ""}</span>
              </div>
            )}
            {invalid.map((x) => (
              <div key={x.id} className="text-[var(--danger-ink)]">
                ✕ <span className="font-mono">{x.id}</span>: {x.problems.join("; ")} — исключено
              </div>
            ))}
            {missing.length > 0 && (
              <div className="text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
                ! Нет в ответе {missing.length} товаров из отправленных пакетов — попросите ИИ продолжить или скопируйте пакет ещё раз:{" "}
                <span className="font-mono">{missing.slice(0, 12).join(", ")}{missing.length > 12 ? "…" : ""}</span>
              </div>
            )}
            {notes.map((n, i) => (
              <div key={i} className="text-[var(--text-muted)]">ℹ Исправлено автоматически: {n}</div>
            ))}
          </div>
        )}
      </Step>

      {/* ---- Step 3 ---- */}
      {reviews && (
        <Step
          n={3}
          title="Проверка и сохранение"
          aside={
            <SegmentedControl<ReviewFilter>
              size="sm"
              value={reviewFilter}
              onChange={setReviewFilter}
              options={[
                { value: "all", label: "Все", count: reviews.length },
                { value: "ok", label: "Готово", count: counts.ok },
                { value: "warn", label: "Проверить", count: counts.warn },
                { value: "error", label: "Ошибки", count: counts.error },
              ]}
            />
          }
        >
          {reviews.length === 0 ? (
            <div className="text-[13px] font-semibold text-[var(--text-faint)]">
              {summary ? "Всё сохранено." : "В ответе нет ни одного товара из списка."}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
                <Button size="sm" variant="outline" onClick={() => bulk("80")}>
                  Только ≥ 80 %
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulk("okwarn")}>
                  Все зелёные и жёлтые
                </Button>
                <Button size="sm" variant="ghost" onClick={() => bulk("none")}>
                  Снять все
                </Button>
                <span className="ml-auto text-[var(--text-muted)]">
                  Поля с уверенностью ниже 40 % по умолчанию не отмечены. Красные поля не сохраняются.
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {visibleReviews.map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    schema={schema}
                    sel={sel.get(r.id) ?? defaultSel(r)}
                    onSel={(patch) => patchSel(r.id, patch)}
                    onAddOption={setAddOption}
                    onEditText={(field, lang, value) =>
                      setReviews((prev) => (prev ?? []).map((x) => (x.id === r.id ? editText(x, field, lang, value) : x)))
                    }
                  />
                ))}
              </div>
            </>
          )}

          <div
            style={{ bottom: "var(--bottom-nav)" }}
            className="sticky z-10 -mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:-mx-5 sm:px-5"
          >
            <Button variant="accent" chamfer size="lg" icon={<Save className="h-4 w-4" />} loading={sending} disabled={payload.length === 0} onClick={send}>
              Сохранить {payload.length} {plural(payload.length)}
            </Button>
            <div className="min-w-[220px]">
              <Toggle checked={replaceSpecs} onChange={setReplaceSpecs} label="Заменить характеристики целиком" />
            </div>
            <div className="min-w-[220px]">
              <Toggle checked={markReady} onChange={setMarkReady} label="Сразу отметить проверенными" />
            </div>
          </div>
          {replaceSpecs && (
            <div className="mt-2 text-[12px] font-semibold text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
              ! Характеристики, которых нет среди отмеченных полей, будут удалены у товара.
            </div>
          )}

          {summary && <SummaryView summary={summary} />}
        </Step>
      )}

      {addOption && (
        <AddOptionModal
          proposal={addOption}
          onClose={() => setAddOption(null)}
          onAdded={() => {
            setAddOption(null);
            invalidateCards(qc, true);
          }}
        />
      )}
    </div>
  );
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "товар";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "товара";
  return "товаров";
}

function SummaryView({ summary }: { summary: { result?: CardImportResult; error?: string; titles: Map<string, string> } }) {
  const r = summary.result;
  const t = (id: string) => summary.titles.get(id) ?? id.slice(0, 8);
  const tr = (r?.items ?? []).reduce(
    (acc, x) => ({ uk: acc.uk + (x.translated?.uk ?? 0), en: acc.en + (x.translated?.en ?? 0), manual: acc.manual + (x.skippedManual ?? 0) }),
    { uk: 0, en: 0, manual: 0 }
  );
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]">
      <div className="section-title mb-2 !text-[12px]">Итог сохранения</div>
      {summary.error && <div className="font-semibold text-[var(--danger-ink)]">✕ {summary.error}</div>}
      {r && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge tone="ok">сохранено {r.applied}</Badge>
            {r.rejected.length > 0 && <Badge tone="danger">отклонено {r.rejected.length}</Badge>}
            {r.issues.length > 0 && <Badge tone="warn">отброшено полей {r.issues.length}</Badge>}
            {r.createdBrands.length > 0 && <Badge tone="info">новые бренды: {r.createdBrands.join(", ")}</Badge>}
            {tr.uk + tr.en > 0 && (
              <Badge tone="ok">
                переводов: UA {tr.uk} · EN {tr.en}
              </Badge>
            )}
            {tr.manual > 0 && <Badge tone="warn">ручные переводы не перезаписаны: {tr.manual}</Badge>}
          </div>
          {r.rejected.length > 0 && (
            <ul className="mt-2 flex flex-col gap-0.5 text-[12px] font-semibold text-[var(--danger-ink)]">
              {r.rejected.map((x, i) => (
                <li key={i}>
                  ✕ {t(x.productId)} — {reasonRu(x.reason)}
                </li>
              ))}
            </ul>
          )}
          {r.issues.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold text-[var(--text-muted)]">Сервер отбросил поля: {r.issues.length}</summary>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-[var(--text-muted)]">
                {r.issues.slice(0, 200).map((x, i) => (
                  <li key={i}>
                    {t(x.productId)} · <span className="font-mono">{x.key}</span> — {reasonRu(x.reason)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </motion.div>
  );
}
