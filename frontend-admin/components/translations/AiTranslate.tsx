"use client";

/**
 * «Перевод с ИИ»: 1) prompt in parts → 2) paste the answer → 3) review / edit → send.
 * The prompt text lives in lib/translation-prompt.ts, parsing/validation in lib/translation-check.ts.
 */
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ClipboardPaste, PartyPopper, Send, Sparkles, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { adminApi, ApiError, type TrImportItem, type TrImportResult, type TrLocale, type TrSourceFixResult } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  buildReview,
  LOCALES,
  parseAnswer,
  revalidate,
  wordDiff,
  type ReviewRow,
  type WorkSet,
} from "@/lib/translation-check";
import { buildPrompt, KIND_LABEL, splitIntoParts, type PromptString } from "@/lib/translation-prompt";
import { invalidateTranslations } from "@/lib/translations";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Toggle } from "@/components/ui/Toggle";
import {
  CopyButton,
  Diff,
  InlineText,
  IssueList,
  KindBadge,
  ProductLink,
  SourceText,
  StatusChip,
} from "@/components/translations/shared";

type PromptFilter = "todo" | "missing" | "stale";
type ReviewFilter = "all" | "ok" | "warn" | "error" | "ru";

interface SendSummary {
  import: Partial<Record<TrLocale, TrImportResult>>;
  fixes: { id: string; result?: TrSourceFixResult; error?: string }[];
  importErrors: string[];
}

const REASON_RU: Record<string, string> = {
  STALE: "оригинал уже изменился",
  MANUAL: "ручной перевод не перезаписан",
  NOT_FOUND: "поле не найдено",
  NO_SOURCE: "оригинал пустой",
};

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="card mb-5 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] border-[3px] border-[var(--line)] bg-[var(--accent)] text-[14px] font-black text-[var(--accent-ink)] shadow-[3px_3px_0_var(--shadow)]">
          {n}
        </span>
        <h2 className="text-[16px] font-black uppercase tracking-wide text-[var(--text)]">{title}</h2>
        {aside && <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function AiTranslate({ ws }: { ws: WorkSet }) {
  const qc = useQueryClient();
  const { push } = useToast();

  // ---- 1. prompt ----------------------------------------------------------
  const [filter, setFilter] = useState<PromptFilter>("todo");
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<number | null>(null);

  const todo = useMemo(() => ws.strings.filter((s) => s.needs.uk || s.needs.en), [ws]);
  const counts = useMemo(
    () => ({
      todo: todo.length,
      missing: todo.filter((s) => s.hasMissing).length,
      stale: todo.filter((s) => s.hasStale).length,
    }),
    [todo]
  );
  const chosen = useMemo(
    () => (filter === "todo" ? todo : todo.filter((s) => (filter === "missing" ? s.hasMissing : s.hasStale))),
    [todo, filter]
  );
  const fieldCount = chosen.reduce((n, s) => n + s.fields.length, 0);
  const parts = useMemo(() => {
    const strings: (PromptString & { ru: string })[] = chosen.map((s) => ({
      id: s.id,
      kind: KIND_LABEL[s.kindKey] ?? s.kindKey,
      product: s.product,
      ru: s.source,
    }));
    const split = splitIntoParts(strings);
    return split.map((p, i) => ({ ids: p.map((x) => x.id), text: buildPrompt(p, i + 1, split.length), chars: p.reduce((n, x) => n + x.ru.length, 0) }));
  }, [chosen]);

  // ---- 2. answer ----------------------------------------------------------
  const [answer, setAnswer] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<{ id: string; problems: string[] }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyFix, setApplyFix] = useState<Set<string>>(new Set());

  function check(text = answer) {
    const parsed = parseAnswer(text);
    setParseErrors(parsed.errors);
    setNotes(parsed.notes);
    if (!text.trim() || parsed.entries.size === 0) {
      setRows(null);
      setUnknown([]);
      setInvalid([]);
      setMissing([]);
      return;
    }
    const r = buildReview(parsed, ws);
    setUnknown(r.unknown);
    setInvalid(r.invalid);
    // Missing = ids of every part the answer touched that are not in it.
    const answered = new Set(parsed.entries.keys());
    const miss: string[] = [];
    for (const p of parts) {
      if (p.ids.some((id) => answered.has(id))) miss.push(...p.ids.filter((id) => !answered.has(id)));
    }
    setMissing(miss);
    setRows(r.rows);
    setSelected(new Set(r.rows.filter((x) => x.level === "ok" && !x.done).map((x) => x.id)));
    setApplyFix(new Set());
    setSummary(null);
  }

  // ---- 3. review ----------------------------------------------------------
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [force, setForce] = useState(false);
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<SendSummary | null>(null);

  const stats = useMemo(() => {
    const r = rows ?? [];
    return {
      ok: r.filter((x) => x.level === "ok").length,
      warn: r.filter((x) => x.level === "warn").length,
      error: r.filter((x) => x.level === "error").length,
      ru: r.filter((x) => x.ruChanged).length,
    };
  }, [rows]);
  const visibleRows = useMemo(
    () =>
      (rows ?? []).filter((r) =>
        reviewFilter === "all" ? true : reviewFilter === "ru" ? r.ruChanged : r.level === reviewFilter
      ),
    [rows, reviewFilter]
  );
  const sendable = (rows ?? []).filter((r) => selected.has(r.id) && r.level !== "error" && !r.done);

  function edit(id: string, patch: Partial<Pick<ReviewRow, "uk" | "en">>) {
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? revalidate({ ...r, ...patch }) : r)));
  }
  function toggle(set: Set<string>, id: string, on: boolean): Set<string> {
    const n = new Set(set);
    if (on) n.add(id);
    else n.delete(id);
    return n;
  }

  async function send() {
    if (!rows || sending) return;
    const chosenRows = sendable;
    const fixRows = chosenRows.filter((r) => applyFix.has(r.id) && r.ruChanged && r.ruIssues.length === 0);
    const plain = chosenRows.filter((r) => !fixRows.includes(r));
    const byLocale: Record<TrLocale, TrImportItem[]> = { uk: [], en: [] };
    for (const r of plain) {
      for (const f of r.str.fields) {
        for (const l of LOCALES) {
          if (f.status[l] === "TRANSLATED") continue;
          byLocale[l].push({
            entityType: f.entityType,
            entityId: f.entityId,
            field: f.field,
            sourceHash: f.sourceHash,
            text: r[l],
          });
        }
      }
    }
    setSending(true);
    const result: SendSummary = { import: {}, fixes: [], importErrors: [] };
    try {
      for (const l of LOCALES) {
        if (!byLocale[l].length) continue;
        try {
          result.import[l] = await adminApi.translationsImport({ locale: l, origin: "AI", force, items: byLocale[l] });
        } catch (e) {
          result.importErrors.push(`${l}: ${e instanceof ApiError ? e.message : "ошибка"}`);
        }
      }
      for (const r of fixRows) {
        try {
          const res = await adminApi.translationsSourceFix({
            items: r.str.fields.map((f) => ({
              entityType: f.entityType,
              entityId: f.entityId,
              field: f.field,
              sourceHash: f.sourceHash,
            })),
            source: r.ru,
            translations: { uk: r.uk, en: r.en },
          });
          result.fixes.push({ id: r.id, result: res });
        } catch (e) {
          result.fixes.push({ id: r.id, error: e instanceof ApiError ? e.message : "ошибка" });
        }
      }
    } finally {
      setSending(false);
    }
    setSummary(result);
    invalidateTranslations(qc);
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    const applied =
      (result.import.uk?.applied ?? 0) +
      (result.import.en?.applied ?? 0) +
      result.fixes.reduce((n, f) => n + (f.result?.translationsApplied ?? 0), 0);
    const fixed = result.fixes.filter((f) => f.result && f.result.updated > 0).length;
    // Sent rows leave the review; what failed stays for another try.
    const failedFix = new Set(result.fixes.filter((f) => f.error || !f.result?.updated).map((f) => f.id));
    const sentIds = new Set(chosenRows.filter((r) => !failedFix.has(r.id)).map((r) => r.id));
    if (!result.importErrors.length) {
      setRows((prev) => (prev ?? []).filter((r) => !sentIds.has(r.id)));
      setSelected(new Set());
      setApplyFix(new Set());
    }
    push(
      result.importErrors.length
        ? "Часть данных не отправлена — см. итог"
        : `Сохранено переводов: ${applied}${fixed ? `, исправлено оригиналов: ${fixed}` : ""}`,
      result.importErrors.length ? "error" : "ok"
    );
  }

  if (todo.length === 0 && !rows) {
    return (
      <EmptyState
        icon={PartyPopper}
        title="Всё переведено"
        description="У всех товаров, вариантов, категорий и способов оплаты есть актуальный перевод на украинский и английский. Измените текст товара — и он появится здесь."
      />
    );
  }

  return (
    <div>
      {/* ---- Step 1 ---- */}
      <Step
        n={1}
        title="Промпт для ИИ"
        aside={
          <SegmentedControl<PromptFilter>
            size="sm"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setCopied(new Set());
            }}
            options={[
              { value: "todo", label: "Всё нужное", count: counts.todo },
              { value: "missing", label: "Нет перевода", count: counts.missing },
              { value: "stale", label: "Устарело", count: counts.stale },
            ]}
          />
        }
      >
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
          Скопируйте промпт в любой чат с ИИ (ChatGPT, Claude…), дождитесь ответа одним блоком кода и вставьте его ниже.
          Одинаковые тексты (общие описания) переводятся один раз:{" "}
          <b className="text-[var(--text)]">{chosen.length}</b> уникальных строк →{" "}
          <b className="text-[var(--text)]">{fieldCount}</b> полей.
          {parts.length > 1 && " Большой объём разбит на части — отправляйте их по очереди, каждую в новом сообщении или чате."}
        </p>
        {chosen.length === 0 ? (
          <div className="text-[13px] font-semibold text-[var(--text-faint)]">По этому фильтру переводить нечего.</div>
        ) : parts.length === 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={parts[0].text} copied={copied.has(0)} onCopied={() => setCopied(new Set(copied).add(0))} />
            <Button variant="ghost" size="sm" onClick={() => setPreview(preview === 0 ? null : 0)} iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", preview === 0 && "rotate-180")} />}>
              Показать текст
            </Button>
            <span className="text-[12px] text-[var(--text-faint)]">{parts[0].text.length.toLocaleString("ru")} симв.</span>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {parts.map((p, i) => (
              <div
                key={i}
                className={cn(
                  "flex flex-col gap-2 rounded-[var(--r-md)] border-[3px] border-[var(--line)] p-3",
                  copied.has(i) ? "bg-[color-mix(in_srgb,var(--ok)_14%,var(--surface))]" : "bg-[var(--surface-2)]"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-black uppercase tracking-wide text-[var(--text)]">
                    Часть {i + 1} из {parts.length}
                  </span>
                  {copied.has(i) && <Badge tone="ok">скопирована</Badge>}
                </div>
                <div className="text-[12px] text-[var(--text-muted)]">
                  {p.ids.length} строк · {p.chars.toLocaleString("ru")} симв. оригинала
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <CopyButton text={p.text} copied={copied.has(i)} onCopied={() => setCopied(new Set(copied).add(i))} label={`Скопировать часть ${i + 1}`} />
                  <Button variant="ghost" size="sm" onClick={() => setPreview(preview === i ? null : i)}>
                    {preview === i ? "Скрыть" : "Текст"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {preview != null && parts[preview] && (
            <motion.pre
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="thin-scroll mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)]"
            >
              {parts[preview].text}
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
          placeholder={'Вставьте сюда ответ целиком — блок ```json { "t…": { "ru": …, "uk": …, "en": … } } ```.\nМожно вставить ответы на несколько частей подряд.'}
          className="thin-scroll w-full resize-y rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2.5 font-mono text-[12px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="accent" icon={<Wand2 className="h-4 w-4" />} onClick={() => check()} disabled={!answer.trim()}>
            Проверить ответ
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
                setRows(null);
                setParseErrors([]);
                setNotes([]);
                setSummary(null);
              }}
            >
              Очистить
            </Button>
          )}
        </div>

        {(parseErrors.length > 0 || notes.length > 0 || unknown.length > 0 || invalid.length > 0 || missing.length > 0) && (
          <div className="mt-3 flex flex-col gap-1.5 text-[13px] font-semibold">
            {parseErrors.map((e, i) => (
              <div key={i} className="text-[var(--danger)]">✕ {e}</div>
            ))}
            {unknown.length > 0 && (
              <div className="text-[var(--danger)]">
                ✕ Неизвестные id ({unknown.length}) — исключены (оригинал изменился или ИИ исказил id):{" "}
                <span className="font-mono">{unknown.slice(0, 12).join(", ")}{unknown.length > 12 ? "…" : ""}</span>
              </div>
            )}
            {invalid.map((x) => (
              <div key={x.id} className="text-[var(--danger)]">
                ✕ <span className="font-mono">{x.id}</span>: {x.problems.join("; ")} — исключено
              </div>
            ))}
            {missing.length > 0 && (
              <div className="text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
                ! Нет в ответе {missing.length} строк из отправленных частей — попросите ИИ дописать их или скопируйте часть ещё раз:{" "}
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
      {rows && (
        <Step
          n={3}
          title="Проверка и отправка"
          aside={
            <SegmentedControl<ReviewFilter>
              size="sm"
              value={reviewFilter}
              onChange={setReviewFilter}
              options={[
                { value: "all", label: "Все", count: rows.length },
                { value: "ok", label: "Готово", count: stats.ok },
                { value: "warn", label: "Проверить", count: stats.warn },
                { value: "error", label: "Ошибки", count: stats.error },
                { value: "ru", label: "Правки ru", count: stats.ru },
              ]}
            />
          }
        >
          {rows.length === 0 ? (
            <div className="text-[13px] font-semibold text-[var(--text-faint)]">
              {summary ? "Всё отправлено." : "В ответе нет ни одной строки из текущего списка."}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set(rows.filter((r) => r.level === "ok" && !r.done).map((r) => r.id)))}>
                  Только зелёные
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set(rows.filter((r) => r.level !== "error" && !r.done).map((r) => r.id)))}>
                  Зелёные + жёлтые
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Снять все
                </Button>
                <span className="ml-auto text-[var(--text-muted)]">
                  Красные не отправляются — исправьте текст прямо в поле, проверка обновится сразу.
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {visibleRows.map((r) => (
                  <ReviewCard
                    key={r.id}
                    row={r}
                    selected={selected.has(r.id)}
                    onSelect={(on) => setSelected(toggle(selected, r.id, on))}
                    fix={applyFix.has(r.id)}
                    onFix={(on) => setApplyFix(toggle(applyFix, r.id, on))}
                    onEdit={(patch) => edit(r.id, patch)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap items-center gap-3 border-t-[3px] border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:-mx-5 sm:px-5">
            <Button variant="accent" size="lg" icon={<Send className="h-4 w-4" />} loading={sending} disabled={sendable.length === 0} onClick={send}>
              Отправить в базу ({sendable.length})
            </Button>
            <div className="min-w-[220px]">
              <Toggle checked={force} onChange={setForce} label="Перезаписывать устаревшие ручные переводы" />
            </div>
            {applyFix.size > 0 && (
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">
                Правок оригинала: {Array.from(applyFix).filter((id) => selected.has(id)).length}
              </span>
            )}
          </div>

          {summary && <SummaryView summary={summary} />}
        </Step>
      )}
    </div>
  );
}

function ReviewCard({
  row,
  selected,
  onSelect,
  fix,
  onFix,
  onEdit,
}: {
  row: ReviewRow;
  selected: boolean;
  onSelect: (on: boolean) => void;
  fix: boolean;
  onFix: (on: boolean) => void;
  onEdit: (patch: Partial<Pick<ReviewRow, "uk" | "en">>) => void;
}) {
  const s = row.str;
  const stripe = row.level === "error" ? "var(--danger)" : row.level === "warn" ? "var(--warn)" : "var(--ok)";
  const products = Array.from(
    new Map(s.fields.filter((f) => f.productId).map((f) => [f.productId!, f.productTitle])).entries()
  );
  const diff = useMemo(() => (row.ruChanged ? wordDiff(s.source, row.ru) : null), [row.ruChanged, row.ru, s.source]);
  const disabled = row.level === "error" || row.done;
  const byLang = (l: string) => row.issues.filter((i) => i.lang === l);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface)] pl-2",
        selected && !disabled && "shadow-[4px_4px_0_var(--shadow)]"
      )}
    >
      <span className="absolute inset-y-0 left-0 w-2" style={{ backgroundColor: stripe }} aria-hidden />
      <div className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className={cn("flex items-center gap-2", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={selected && !disabled}
              disabled={disabled}
              onChange={(e) => onSelect(e.target.checked)}
            />
            <span className="font-mono text-[12px] font-bold text-[var(--text-muted)]">{row.id}</span>
          </label>
          <KindBadge kindKey={s.kindKey} />
          {s.fields.length > 1 && <Badge tone="info">×{s.fields.length} полей</Badge>}
          {row.done && <Badge tone="neutral">уже переведено — пропуск</Badge>}
          {(["uk", "en"] as const).map((l) =>
            s.needs[l] ? (
              <StatusChip key={l} lang={l} status={s.hasMissing && s.fields.some((f) => f.status[l] === "MISSING") ? "MISSING" : "STALE"} />
            ) : null
          )}
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {products.slice(0, 3).map(([id, title]) => (
              <ProductLink key={id} productId={id} title={title} />
            ))}
            {products.length > 3 && <span className="text-[12px] text-[var(--text-faint)]">и ещё {products.length - 3}</span>}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <div>
            <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-[var(--text-faint)]">RU · оригинал</div>
            <div className="rounded-[var(--r-md)] border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-2)] px-2.5 py-2">
              <SourceText text={s.source} />
            </div>
            <IssueList issues={byLang("ru")} />
          </div>
          {(["uk", "en"] as const).map((l) => (
            <div key={l}>
              <div className="mb-1 text-[11px] font-black uppercase tracking-wide text-[var(--text-faint)]">
                {l === "uk" ? "UK · українська" : "EN · english"}
              </div>
              <InlineText
                ariaLabel={`${row.id} ${l}`}
                value={row[l]}
                invalid={byLang(l).some((i) => i.level === "error")}
                onChange={(v) => onEdit({ [l]: v })}
              />
              <IssueList issues={byLang(l)} />
            </div>
          ))}
        </div>

        {row.ruChanged && (
          <div className="mt-3 rounded-[var(--r-md)] border-2 border-[var(--line)] bg-[color-mix(in_srgb,var(--c3)_18%,var(--surface))] p-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--text)]" />
              <span className="text-[12px] font-black uppercase tracking-wide text-[var(--text)]">
                Предложенная правка оригинала
              </span>
              <label
                className={cn(
                  "ml-auto flex items-center gap-2 text-[12px] font-bold",
                  row.ruIssues.length ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                )}
                title={
                  row.ruIssues.length
                    ? "Правка небезопасна — исправьте оригинал вручную в товаре"
                    : `Русский текст заменится во всех полях с этим текстом (${s.fields.length}); uk/en сохранятся уже для нового текста`
                }
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={fix && row.ruIssues.length === 0}
                  disabled={row.ruIssues.length > 0}
                  onChange={(e) => onFix(e.target.checked)}
                />
                Применить правку к оригиналу{s.fields.length > 1 ? ` (${s.fields.length} полей)` : ""}
              </label>
            </div>
            {diff ? <Diff parts={diff} /> : <SourceText text={row.ru} />}
            <IssueList issues={row.ruIssues} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryView({ summary }: { summary: SendSummary }) {
  const rejected = [
    ...(summary.import.uk?.rejected ?? []).map((r) => ({ ...r, l: "uk" })),
    ...(summary.import.en?.rejected ?? []).map((r) => ({ ...r, l: "en" })),
    ...summary.fixes.flatMap((f) => (f.result?.rejected ?? []).map((r) => ({ ...r, l: "ru" }))),
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-[var(--r-md)] border-[3px] border-[var(--line)] bg-[var(--surface-2)] p-3 text-[13px]"
    >
      <div className="mb-2 text-[12px] font-black uppercase tracking-wide text-[var(--text)]">Итог отправки</div>
      <div className="flex flex-wrap gap-2">
        {LOCALES.map((l) => {
          const r = summary.import[l];
          if (!r) return null;
          return (
            <div key={l} className="flex flex-wrap items-center gap-1.5">
              <span className="font-black uppercase">{l}:</span>
              <Badge tone="ok">сохранено {r.applied}</Badge>
              {r.skippedStale > 0 && <Badge tone="warn">устарело {r.skippedStale}</Badge>}
              {r.skippedManual > 0 && <Badge tone="warn">ручные {r.skippedManual}</Badge>}
              {r.notFound + r.invalid > 0 && <Badge tone="danger">отклонено {r.notFound + r.invalid}</Badge>}
            </div>
          );
        })}
        {summary.fixes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-black uppercase">ru:</span>
            <Badge tone="ok">исправлено полей {summary.fixes.reduce((n, f) => n + (f.result?.updated ?? 0), 0)}</Badge>
            <Badge tone="ok">переводов {summary.fixes.reduce((n, f) => n + (f.result?.translationsApplied ?? 0), 0)}</Badge>
          </div>
        )}
      </div>
      {summary.importErrors.map((e, i) => (
        <div key={i} className="mt-2 font-semibold text-[var(--danger)]">✕ {e}</div>
      ))}
      {summary.fixes.filter((f) => f.error).map((f) => (
        <div key={f.id} className="mt-2 font-semibold text-[var(--danger)]">✕ правка {f.id}: {f.error}</div>
      ))}
      {rejected.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-[var(--text-muted)]">Не сохранено: {rejected.length}</summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[12px] text-[var(--text-muted)]">
            {rejected.slice(0, 100).map((r, i) => (
              <li key={i}>
                {r.l} · {r.entityType}.{r.field} {r.entityId?.slice(0, 8)} — {REASON_RU[r.reason] ?? r.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(summary.import.uk?.skippedManual || summary.import.en?.skippedManual) ? (
        <div className="mt-2 text-[12px] text-[var(--text-muted)]">
          Ручные переводы не перезаписываются. Включите «Перезаписывать устаревшие ручные переводы» или поправьте их во вкладке «Все переводы».
        </div>
      ) : null}
    </motion.div>
  );
}
