"use client";

/**
 * Review panel of one card (right drawer; a full-screen sheet from the bottom on a phone): what the
 * LAST AI import changed — category / brand «было → стало», characteristics with the AI's
 * confidence (least sure first) and sources, texts ru/uk/en «было / стало» editable in place — who
 * reviewed it and when. «Принять» saves the edits and makes the card READY, then the next card of
 * the list opens. Keys: J / K — next / previous, A — accept, Esc — close (lib/overlay-stack).
 *
 * Data: GET /api/admin/cards/{id}/review (card_meta.last + reviewer name + current uk/en texts),
 * PUT …/accept (edits + READY), PATCH …/card-status (back to «Проверить»).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import {
  ArrowRight,
  Check as CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  MessageSquareText,
  PencilLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { adminApi, ApiError, type CardMeta as ApiCardMeta, type ProductSpecs } from "@/lib/api";
import { attributesForCategory as adminAttributesFor } from "@/lib/catalog-admin";
import { formatValue, sameValue, TEXT_LABEL, wordDiff, type TextField } from "@/lib/card-check";
import { attributesForCategory, categoryPathName, type CardAttribute, type CardItem, type CardSchema } from "@/lib/card-prompt";
import { cardsApi, type CardAcceptBody, type CardChange, type CardReviewData, type CardTextTranslations } from "@/lib/cards-api";
import { invalidateCards } from "@/lib/cards";
import { fieldsWord, metaOf, missingLabels, tabOf } from "@/lib/cards-view";
import { cn } from "@/lib/cn";
import { backdropVariants, drawerVariants, sheetVariants } from "@/lib/motion";
import { isTopLayer, useOverlayLayer } from "@/lib/overlay-stack";
import { useToast } from "@/lib/toast";
import { useMediaQuery } from "@/lib/use-media";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";

import { Skeleton } from "@/components/ui/Skeleton";
import { SpecsForm } from "@/components/catalog/SpecsForm";
import { Diff, InlineText, SourceText } from "@/components/translations/shared";
import { CardStatusChip, CONFIDENCE_HINT, ConfidenceDot, ConfidencePill, fmtDate, Thumb } from "@/components/cards/shared";

type Lang = "ru" | "uk" | "en";
const LANG_LABEL: Record<Lang, string> = { ru: "RU", uk: "UA", en: "EN" };
const TEXT_FIELDS: TextField[] = ["title", "description", "conditionNote"];

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function ReviewPanel({
  item,
  schema,
  position,
  onPrev,
  onNext,
  onClose,
  onDone,
  onReAi,
}: {
  /** The list row (instant header while the review loads); null = closed. */
  item: CardItem | null;
  schema: CardSchema | undefined;
  /** 1-based place in the list and its length. */
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  /** The card left the current tab (accepted / sent back): open the next one. */
  onDone: () => void;
  /** «Переоформить с ИИ» — the single-product completion modal. */
  onReAi: (id: string) => void;
}) {
  const open = !!item;
  const phone = useMediaQuery("(max-width: 639px)", false);
  const [confirm, confirmUi] = useConfirm();
  const [dirty, setDirty] = useState(false);

  // Leaving with unsaved edits asks first (Esc, ×, backdrop, J/K, the arrows).
  const guarded = useCallback(
    async (action: (() => void) | null) => {
      if (!action) return;
      if (dirty && !(await confirm({ title: "Правки не сохранены", message: "Уйти без сохранения? Изменения в этой карточке пропадут.", confirmLabel: "Уйти", danger: true })))
        return;
      setDirty(false);
      action();
    },
    [dirty, confirm]
  );
  const layer = useOverlayLayer(open, () => void guarded(onClose));

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <PanelLayer>
            <motion.div
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={() => void guarded(onClose)}
              className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={`Проверка карточки: ${item.title}`}
              variants={phone ? sheetVariants : drawerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn(
                "absolute flex flex-col bg-[var(--surface)] shadow-[var(--shadow-3)]",
                phone ? "inset-0" : "inset-y-0 right-0 w-full max-w-[720px] rounded-l-[var(--r-xl)] border-l border-[var(--line-strong)]"
              )}
            >
              <PanelBody
                key={item.id}
                layer={layer}
                item={item}
                schema={schema}
                position={position}
                onPrev={onPrev ? () => void guarded(onPrev) : null}
                onNext={onNext ? () => void guarded(onNext) : null}
                onClose={() => void guarded(onClose)}
                onDone={() => {
                  setDirty(false);
                  onDone();
                }}
                onReAi={() => void guarded(() => onReAi(item.id))}
                onDirty={setDirty}
              />
            </motion.aside>
          </PanelLayer>
        )}
      </AnimatePresence>
      {confirmUi}
    </>,
    document.body
  );
}

/**
 * The positioning layer of the open panel. As with the Modal (components/ui/Modal.tsx, ModalLayer):
 * with framer-motion 11 the exit of an AnimatePresence child sometimes never completes, and the
 * invisible panel would then swallow every click — so a leaving layer stops taking clicks at once
 * and is hidden for good shortly after.
 */
function PanelLayer({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (present) return;
    const t = setTimeout(() => setGone(true), 400);
    return () => clearTimeout(t);
  }, [present]);
  return (
    <div
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      className={cn("fixed inset-0 z-[120]", !present && "pointer-events-none", gone && "invisible")}
    >
      {children}
    </div>
  );
}

function PanelBody({
  layer,
  item,
  schema,
  position,
  onPrev,
  onNext,
  onClose,
  onDone,
  onReAi,
  onDirty,
}: {
  layer: string;
  item: CardItem;
  schema: CardSchema | undefined;
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  onDone: () => void;
  onReAi: () => void;
  onDirty: (d: boolean) => void;
}) {
  const qc = useQueryClient();
  const { push } = useToast();
  const reviewQ = useQuery({
    queryKey: ["admin", "cards", "review", item.id],
    queryFn: () => cardsApi.review(item.id),
    staleTime: 0,
  });
  const data = reviewQ.data;
  const cur = data?.item ?? item;
  const tab = tabOf(cur);
  const meta = metaOf(cur);

  // ---- edits ------------------------------------------------------------------
  const [specsDraft, setSpecsDraft] = useState<ProductSpecs | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"accept" | "back" | null>(null);

  const currentText = useCallback(
    (lang: Lang, field: TextField): string => {
      if (lang === "ru") return (field === "title" ? cur.title : field === "description" ? cur.description : cur.conditionNote) ?? "";
      return data?.translations[lang]?.[field]?.text ?? "";
    },
    [cur, data]
  );
  const textEdits = useMemo(
    () => Object.entries(texts).filter(([k, v]) => v.trim() !== currentText(k.split("/")[0] as Lang, k.split("/")[1] as TextField).trim()),
    [texts, currentText]
  );
  const specsEdited = specsDraft !== null && !sameValue(specsDraft, cur.specs ?? {});
  const dirty = specsEdited || textEdits.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  function body(): CardAcceptBody {
    const b: CardAcceptBody = {};
    if (specsEdited) b.specs = specsDraft as Record<string, unknown>;
    const tr: Partial<Record<"uk" | "en", CardTextTranslations>> = {};
    for (const [k, v] of textEdits) {
      const [lang, field] = k.split("/") as [Lang, TextField];
      if (lang === "ru") {
        if (field === "title") b.title = v.trim();
        else if (field === "description") b.description = v.trim();
      } else {
        (tr[lang] ??= {})[field] = v.trim();
      }
    }
    if (Object.keys(tr).length) b.translations = tr;
    return b;
  }

  async function accept() {
    if (busy) return;
    setBusy("accept");
    try {
      const b = body();
      const res = await cardsApi.accept(cur.id, { ...b, ready: true });
      const dropped = res.issues.length;
      push(
        `«${cur.title}» — в «Готово»${dirty ? " с правками" : ""}${dropped ? ` · сервер отбросил ${dropped} ${fieldsWord(dropped)}` : ""}`,
        dropped ? "info" : "ok"
      );
      invalidateCards(qc);
      qc.invalidateQueries({ queryKey: ["admin", "cards", "review", cur.id] });
      onDone();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdits() {
    if (busy || !dirty) return;
    setBusy("accept");
    try {
      await cardsApi.accept(cur.id, { ...body(), ready: true });
      push("Правки сохранены", "ok");
      setSpecsDraft(null);
      setTexts({});
      invalidateCards(qc);
      await reviewQ.refetch();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(null);
    }
  }

  async function sendBack() {
    if (busy) return;
    setBusy("back");
    try {
      await cardsApi.setCardStatus(cur.id, "AI_FILLED");
      push(`«${cur.title}» — снова в «Проверить»`, "ok");
      invalidateCards(qc);
      onDone();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(null);
    }
  }

  // ---- keys: J / K / A (Esc is the overlay stack's) ---------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isEditable(e.target) || !isTopLayer(layer)) return;
      const k = e.key.toLowerCase();
      if ((k === "j" || k === "о") && onNext) {
        e.preventDefault();
        onNext();
      } else if ((k === "k" || k === "л") && onPrev) {
        e.preventDefault();
        onPrev();
      } else if ((k === "a" || k === "ф") && tab !== "ready") {
        e.preventDefault();
        void accept();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const missing = cur.missingRequired ?? [];
  const reviewedAt = fmtDate(data?.reviewedAt ?? meta.reviewedAt);
  const importedAt = fmtDate(data?.importedAt ?? meta.importedAt);
  const editorHref = `/products?edit=${cur.id}&step=specs`;

  return (
    <>
      {/* header */}
      <div
        data-app-chrome
        className="flex items-start gap-3 border-b border-[var(--line)] px-4 pb-3 pt-[calc(12px+var(--safe-top))] sm:px-5 sm:pt-[calc(16px+var(--safe-top))]"
      >
        <Thumb src={cur.imageUrl} alt={cur.title} size={52} />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--ink)]" title={cur.title}>
            {cur.title}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CardStatusChip status={cur.cardStatus} />
            {cur.cardConfidence != null && <ConfidencePill value={cur.cardConfidence} label="ИИ" />}
            {cur.unfinished === true ? (
              <Badge tone="warn">новый, скрыт</Badge>
            ) : cur.active !== true ? (
              <Badge tone="neutral">скрыт</Badge>
            ) : (
              <Badge tone="ok">на витрине</Badge>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Закрыть (Esc)"
          title="Закрыть (Esc)"
          className="nb-press focusable grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* body */}
      <div className="thin-scroll min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4 sm:px-5">
        {reviewQ.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        ) : reviewQ.isError ? (
          <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3 text-[13px] font-semibold text-[var(--danger-ink)]">
            ✕ Не удалось загрузить карточку.{" "}
            <button type="button" className="underline" onClick={() => reviewQ.refetch()}>
              Повторить
            </button>
          </div>
        ) : (
          <div className="tab-in flex flex-col gap-5">
            {missing.length > 0 && (
              <div className="flex gap-2.5 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--warn)_40%,transparent)] bg-[color-mix(in_srgb,var(--warn)_9%,transparent)] p-3 text-[13px] leading-relaxed text-[var(--text)]">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
                <div>
                  <b>
                    Нет {missing.length} обязательных {fieldsWord(missing.length)}:
                  </b>{" "}
                  {missingLabels(schema, cur).join(", ")}. Заполните ниже («Править») или в редакторе — без них карточка неполная.
                </div>
              </div>
            )}

            <Section title="Категория и бренд">
              <div className="flex flex-col gap-1.5">
                <ScalarRow
                  label="Категория"
                  change={data?.last?.changed?.category}
                  current={(schema && categoryPathName(schema, cur.categorySlug)) || cur.categorySlug || null}
                  fmt={(v) => (schema && categoryPathName(schema, v)) || v}
                />
                <ScalarRow label="Бренд" change={data?.last?.changed?.brand} current={cur.brand ?? null} fmt={(v) => v} />
              </div>
            </Section>

            <SpecsSection
              item={cur}
              schema={schema}
              data={data}
              draft={specsDraft}
              onDraft={setSpecsDraft}
            />

            <TextsSection data={data} currentText={currentText} texts={texts} onText={(k, v) => setTexts((t) => ({ ...t, [k]: v }))} />

            {((meta.sources?.length ?? 0) > 0 || meta.notes) && (
              <Section title="Источники и заметки ИИ">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(meta.sources?.length ?? 0) > 0 && (
                    <ul className="flex flex-col gap-1">
                      {meta.sources!.map((s, i) => (
                        <li key={i} className="min-w-0">
                          <a
                            href={s}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            title={s}
                            className="focusable inline-flex max-w-full items-center gap-1 rounded-[var(--r-sm)] text-[12.5px] font-semibold text-[var(--info)] hover:underline"
                          >
                            <span className="truncate">{host(s)}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {meta.notes && (
                    <div className="flex gap-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                      <span className="whitespace-pre-wrap">{meta.notes}</span>
                    </div>
                  )}
                </div>
              </Section>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--text-faint)]">
              <span>
                {reviewedAt ? (
                  <>
                    <ShieldCheck className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-[var(--ok)]" />
                    Проверил{data?.reviewedByName ? <b className="font-semibold text-[var(--text-muted)]"> {data.reviewedByName}</b> : ""} · {reviewedAt}
                  </>
                ) : (
                  "Ещё не проверена"
                )}
              </span>
              {importedAt && (
                <span>
                  Импорт ИИ {importedAt}
                  {meta.model ? ` · ${meta.model}` : ""}
                  {data?.last?.editedAt ? ` · правки ${fmtDate(data.last.editedAt)}` : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 pt-3 pb-[calc(12px+var(--safe-bottom))] sm:px-5">
        <div className="flex items-center gap-1">
          <NavButton label="Предыдущая (K)" disabled={!onPrev} onClick={() => onPrev?.()}>
            <ChevronLeft className="h-4 w-4" />
          </NavButton>
          <span className="tabular min-w-[52px] text-center text-[12px] font-semibold text-[var(--text-faint)]">
            {position.index} / {position.total}
          </span>
          <NavButton label="Следующая (J)" disabled={!onNext} onClick={() => onNext?.()}>
            <ChevronRight className="h-4 w-4" />
          </NavButton>
        </div>
        <span className="flex-1" />
        <Link
          href={editorHref}
          target="_blank"
          title="Открыть товар в редакторе на шаге «Характеристики» (новая вкладка)"
          aria-label="Открыть в редакторе"
          className="focusable inline-flex h-10 items-center gap-1.5 rounded-[var(--r-md)] px-3 font-display text-[12px] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] pointer-coarse:h-11"
        >
          <span className="max-sm:hidden">В редакторе</span> <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <Button
          variant="outline"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={onReAi}
          aria-label={tab === "draft" ? "Оформить с ИИ" : "Переоформить с ИИ"}
          title={tab === "draft" ? "Оформить с ИИ" : "Переоформить с ИИ"}
        >
          <span className="max-sm:hidden">{tab === "draft" ? "Оформить с ИИ" : "Переоформить"}</span>
        </Button>
        {tab === "ready" ? (
          dirty ? (
            <Button variant="accent" icon={<CheckIcon className="h-4 w-4" />} loading={busy === "accept"} onClick={saveEdits}>
              Сохранить правки
            </Button>
          ) : (
            <Button variant="surface" icon={<RotateCcw className="h-4 w-4" />} loading={busy === "back"} onClick={sendBack}>
              Вернуть на проверку
            </Button>
          )
        ) : (
          <Button
            variant="accent"
            chamfer
            icon={<CheckIcon className="h-4 w-4" />}
            loading={busy === "accept"}
            onClick={accept}
            title="Принять карточку (A): правки сохранятся, карточка уйдёт в «Готово»"
            className="max-sm:w-full"
          >
            {dirty ? "Сохранить и принять" : "Принять"}
            <kbd aria-hidden className="ml-1 hidden rounded-[3px] border border-[rgba(14,14,16,.25)] px-1 font-mono text-[10px] leading-[14px] sm:inline">A</kbd>
          </Button>
        )}
      </div>
    </>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="nb-press focusable grid h-9 w-9 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-35 pointer-coarse:h-11 pointer-coarse:w-11"
    >
      {children}
    </button>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-2">
        <h3 className="section-title !text-[12.5px] text-[var(--ink)]">{title}</h3>
        {aside && <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function EditedMark() {
  return (
    <span className="chip-tint !px-1.5 !text-[9.5px] !leading-[14px]" style={{ "--chip": "var(--accent-hi)" } as CSSProperties} title="Исправлено админом после импорта">
      правка
    </span>
  );
}

function ScalarRow({
  label,
  change,
  current,
  fmt,
}: {
  label: string;
  change: CardChange<string> | undefined;
  current: string | null;
  fmt: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2 text-[13px]">
      <span className="field-label w-[86px] shrink-0 !text-[11px]">{label}</span>
      {change ? (
        <>
          <span className="text-[var(--text-faint)] line-through decoration-[var(--text-faint)]">{change.before ? fmt(change.before) : "—"}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" />
          <b className="text-[var(--text)]">{change.after ? fmt(change.after) : "—"}</b>
          {change.edited && <EditedMark />}
        </>
      ) : (
        <>
          <span className="text-[var(--text)]">{current ?? "—"}</span>
          <span className="text-[11.5px] text-[var(--text-faint)]">без изменений</span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- characteristics

interface SpecRow {
  key: string;
  attr: CardAttribute | undefined;
  label: string;
  value: unknown;
  change: CardChange | undefined;
  confidence: number | null;
  src: string | null;
  missing: boolean;
}

function SpecsSection({
  item,
  schema,
  data,
  draft,
  onDraft,
}: {
  item: CardItem;
  schema: CardSchema | undefined;
  data: CardReviewData | undefined;
  draft: ProductSpecs | null;
  onDraft: (s: ProductSpecs | null) => void;
}) {
  const editing = draft !== null;
  const [showSameRaw, setShowSame] = useState<boolean | null>(null);
  const adminSchemaQ = useQuery({ queryKey: ["catalog-schema"], queryFn: adminApi.catalogSchema, enabled: editing, staleTime: 60_000 });

  const rows = useMemo((): SpecRow[] => {
    const attrs = schema ? attributesForCategory(schema, item.categorySlug) : [];
    const specs = item.specs ?? {};
    const changed = data?.last?.changed?.specs ?? {};
    const fields = metaOf(item).fields ?? {};
    const missing = new Set(item.missingRequired ?? []);
    const keys = [...new Set([...attrs.map((a) => a.key), ...Object.keys(specs), ...Object.keys(changed)])];
    return keys
      .map((key) => {
        const attr = attrs.find((a) => a.key === key);
        const change = changed[key];
        return {
          key,
          attr,
          label: attr?.labelRu ?? key,
          value: specs[key],
          change,
          confidence: change?.c ?? fields[key]?.c ?? null,
          src: change?.src ?? fields[key]?.src ?? null,
          missing: missing.has(key),
        };
      })
      .filter((r) => r.change || r.missing || (r.value !== undefined && r.value !== null));
  }, [schema, item, data]);

  // Changed by the last import, least sure first; then the required ones still empty; then the rest.
  const changed = rows.filter((r) => r.change).sort((a, b) => (a.confidence ?? 101) - (b.confidence ?? 101));
  const empty = rows.filter((r) => !r.change && r.missing);
  const same = rows.filter((r) => !r.change && !r.missing);
  const low = changed.filter((r) => r.confidence != null && r.confidence < 60).length;
  // Nothing changed and nothing missing (a reviewed card): show what it has right away.
  const showSame = showSameRaw ?? (changed.length === 0 && empty.length === 0);


  const adminAttrs = useMemo(
    () => (adminSchemaQ.data && item.categoryId ? adminAttributesFor(adminSchemaQ.data.attributes, adminSchemaQ.data.categories, item.categoryId) : []),
    [adminSchemaQ.data, item.categoryId]
  );

  return (
    <Section
      title="Характеристики"
      aside={
        <>
          {!editing && low > 0 && <Badge tone="warn">неуверенных {low}</Badge>}
          <Button
            size="sm"
            variant={editing ? "ghost" : "outline"}
            icon={editing ? <X className="h-3.5 w-3.5" /> : <PencilLine className="h-3.5 w-3.5" />}
            onClick={() => onDraft(editing ? null : ({ ...(item.specs ?? {}) } as ProductSpecs))}
            disabled={!item.categoryId}
            title={item.categoryId ? undefined : "У товара нет категории — сначала выберите её в редакторе"}
          >
            {editing ? "Отменить правки" : "Править"}
          </Button>
        </>
      }
    >
      {editing ? (
        adminSchemaQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : adminAttrs.length === 0 ? (
          <div className="text-[13px] text-[var(--text-faint)]">У категории нет характеристик в схеме.</div>
        ) : (
          <div className="tab-in rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-3">
            <SpecsForm
              attrs={adminAttrs}
              groups={adminSchemaQ.data?.groups ?? []}
              specs={draft}
              onChange={onDraft}
              meta={item.cardMeta as ApiCardMeta | null}
              resetKey={`${item.id}-${item.categoryId}`}
              highlightMissing
            />
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line)] px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">
          Характеристик нет — оформите карточку с ИИ или заполните вручную («Править»).
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)]">
          <div className="hidden grid-cols-[minmax(150px,1.1fr)_minmax(0,1.6fr)_104px] gap-3 border-b border-[var(--line)] bg-[var(--bg-2)] px-3 py-1.5 sm:grid">
            <span className="field-label !text-[10.5px]">Характеристика</span>
            <span className="field-label !text-[10.5px]">Было → стало</span>
            <span className="field-label text-right !text-[10.5px]" title={CONFIDENCE_HINT}>
              ИИ
            </span>
          </div>
          {changed.map((r) => (
            <SpecLine key={r.key} r={r} />
          ))}
          {empty.map((r) => (
            <SpecLine key={r.key} r={r} />
          ))}
          {same.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowSame(!showSame)}
                aria-expanded={showSame}
                className="focusable flex w-full items-center gap-1.5 border-t border-[var(--line)] px-3 py-2 text-left text-[12px] font-semibold text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-muted)]"
              >
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSame && "rotate-180")} />
                Без изменений: {same.length}
              </button>
              {showSame && (
                <div className="tab-in">
                  {same.map((r) => (
                    <SpecLine key={r.key} r={r} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Section>
  );
}

function SpecLine({ r }: { r: SpecRow }) {
  const changed = !!r.change;
  const removed = changed && (r.change!.after === undefined || r.change!.after === null);
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b border-[var(--line)] px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(150px,1.1fr)_minmax(0,1.6fr)_104px]",
        r.missing && !changed && "bg-[color-mix(in_srgb,var(--warn)_6%,transparent)]"
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--text)]">
        <ConfidenceDot value={changed || r.confidence != null ? r.confidence : undefined} />
        <span className="truncate" title={r.key}>
          {r.label}
        </span>
        {r.attr?.required && (
          <span className="text-[11px] text-[var(--accent-hi)]" title="Обязательная для полной карточки">
            *
          </span>
        )}
        {r.change?.edited && <EditedMark />}
      </span>
      <span className="col-start-1 row-start-2 min-w-0 text-[13px] sm:col-start-auto sm:row-start-auto">
        {changed ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="text-[var(--text-faint)] line-through decoration-[var(--text-faint)]">{formatValue(r.attr, r.change!.before)}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-[var(--text-faint)]" />
            <b className={removed ? "font-semibold text-[var(--danger-ink)]" : "font-semibold text-[var(--text)]"}>{removed ? "удалено" : formatValue(r.attr, r.change!.after)}</b>
          </span>
        ) : r.missing ? (
          <span className="font-semibold text-[color-mix(in_srgb,var(--warn)_85%,var(--text))]">не заполнено</span>
        ) : (
          <span className="text-[var(--text-muted)]">{formatValue(r.attr, r.value)}</span>
        )}
      </span>
      <span className="col-start-2 row-span-2 row-start-1 flex items-center justify-end gap-1.5 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
        {r.confidence != null && (
          <span
            className="tabular whitespace-nowrap text-[11.5px] font-semibold"
            style={{ color: r.confidence < 40 ? "var(--danger-ink)" : r.confidence < 60 ? "var(--warn)" : "var(--text-muted)" }}
            title={`ИИ уверена в этом значении на ${r.confidence} %`}
          >
            ИИ {r.confidence} %
          </span>
        )}
        {r.src && (
          <a
            href={r.src}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={`Источник: ${r.src}`}
            aria-label={`Источник значения «${r.label}»`}
            className="focusable grid h-6 w-6 place-items-center rounded-[var(--r-sm)] text-[var(--info)] transition-colors hover:bg-[var(--surface-2)]"
          >
            <Link2 className="h-3.5 w-3.5" />
          </a>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------- texts

function TextsSection({
  data,
  currentText,
  texts,
  onText,
}: {
  data: CardReviewData | undefined;
  currentText: (lang: Lang, field: TextField) => string;
  texts: Record<string, string>;
  onText: (key: string, value: string) => void;
}) {
  const [lang, setLang] = useState<Lang>("ru");
  const changes = data?.last?.changed?.texts ?? {};
  const count = (l: Lang) => TEXT_FIELDS.filter((f) => changes[`${l}/${f}`]).length || undefined;
  const fields = TEXT_FIELDS.filter((f) => f !== "conditionNote" || !!currentText("ru", "conditionNote"));
  return (
    <Section
      title="Тексты"
      aside={
        // Plain buttons, not SegmentedControl: its layout animation inside an exiting panel is
        // what leaves framer's exit unfinished (see PanelLayer).
        <div role="tablist" aria-label="Язык текстов" className="inline-flex items-center gap-0.5 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-[3px]">
          {(["ru", "uk", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              className={cn(
                "focusable font-display flex items-center gap-1.5 rounded-[var(--r-sm)] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors pointer-coarse:py-1.5",
                lang === l
                  ? "border-[rgba(255,102,0,.45)] bg-[var(--accent-soft)] text-[var(--accent-hi)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
              )}
            >
              {LANG_LABEL[l]}
              {count(l) != null && (
                <span
                  className={cn(
                    "tabular rounded-full px-1.5 text-[10.5px] leading-[16px]",
                    lang === l ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                  )}
                >
                  {count(l)}
                </span>
              )}
            </button>
          ))}
        </div>
      }

    >
      <div key={lang} className="tab-in flex flex-col gap-3">
        {fields.map((f) => {
          const key = `${lang}/${f}`;
          return (
            <TextBlock
              key={key}
              lang={lang}
              field={f}
              current={currentText(lang, f)}
              change={changes[key]}
              state={lang === "ru" ? undefined : data?.translations[lang]?.[f]}
              draft={texts[key]}
              onDraft={(v) => onText(key, v)}
            />
          );
        })}
        {lang !== "ru" && (
          <p className="text-[11.5px] text-[var(--text-faint)]">Правка перевода сохранится как ручная — следующий импорт ИИ её не перезапишет.</p>
        )}
      </div>
    </Section>
  );
}

function TextBlock({
  lang,
  field,
  current,
  change,
  state,
  draft,
  onDraft,
}: {
  lang: Lang;
  field: TextField;
  current: string;
  change: CardChange<string> | undefined;
  state: { origin: "AI" | "MANUAL"; stale: boolean } | undefined;
  draft: string | undefined;
  onDraft: (v: string) => void;
}) {
  const [editing, setEditing] = useState(draft !== undefined);
  // The Russian condition note is the product's own (edited in the product), its uk/en are here.
  const editable = !(lang === "ru" && field === "conditionNote");
  const before = change?.before ?? "";
  const diff = useMemo(() => {
    if (!change || !before) return null;
    const parts = wordDiff(before, current);
    if (!parts) return null;
    const same = parts.filter((p) => p.type === "same").reduce((n, p) => n + p.text.trim().length, 0);
    // A full rewrite as a word diff is red-green noise: «было» / «стало» instead.
    return same / Math.max(1, current.length) < 0.4 && field === "description" ? null : parts;
  }, [change, before, current, field]);
  const edited = draft !== undefined && draft.trim() !== current.trim();

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12.5px] font-semibold text-[var(--text)]">{TEXT_LABEL[field]}</span>
        {change ? (
          <Badge tone="info">{before ? "изменено ИИ" : "добавлено ИИ"}</Badge>
        ) : current ? (
          <span className="text-[11.5px] text-[var(--text-faint)]">без изменений</span>
        ) : null}
        {change?.edited && <EditedMark />}
        {state?.origin === "MANUAL" && <Badge tone="neutral">ручной</Badge>}
        {state?.stale && (
          <span title="Перевод сделан для другого русского текста — на сайте покажется русский, пока его не обновят">
            <Badge tone="warn">устарел</Badge>
          </span>
        )}
        {edited && <Badge tone="accent">не сохранено</Badge>}
        {editable && (
          <button
            type="button"
            onClick={() => {
              if (!editing && draft === undefined) onDraft(current);
              setEditing(!editing);
            }}
            className="focusable ml-auto inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-faint)] transition-colors hover:text-[var(--accent-hi)]"
          >
            <PencilLine className="h-3.5 w-3.5" /> {editing ? "Готово" : "Править"}
          </button>
        )}
      </div>
      {editing ? (
        <InlineText ariaLabel={`${TEXT_LABEL[field]} ${LANG_LABEL[lang]}`} value={draft ?? current} onChange={onDraft} />
      ) : edited ? (
        <SourceText text={draft!} />
      ) : !current ? (
        <div className="text-[13px] text-[var(--text-faint)]">{lang === "ru" ? "— пусто —" : "Нет перевода — на сайте покажется русский текст."}</div>
      ) : diff ? (
        <Diff parts={diff} />
      ) : change && before ? (
        <div className="grid gap-2 lg:grid-cols-2">
          <div>
            <div className="field-label mb-1 !text-[10.5px] !text-[var(--text-faint)]">Было</div>
            <div className="text-[var(--text-muted)] opacity-80">
              <SourceText text={before} />
            </div>
          </div>
          <div>
            <div className="field-label mb-1 !text-[10.5px] !text-[var(--text-faint)]">Стало</div>
            <SourceText text={current} />
          </div>
        </div>
      ) : (
        <SourceText text={current} />
      )}
    </div>
  );
}
