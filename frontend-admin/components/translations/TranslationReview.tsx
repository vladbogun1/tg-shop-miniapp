"use client";

/**
 * «Переводы» → просмотр по одному. The Russian original and the translations side by side; for an
 * outdated translation — what changed in the original; edit in place; «Принять и дальше» / «Пропустить».
 *
 * The queue (texts in the order of the list) is frozen when the review opens: a text that was just
 * accepted moves to another tab, but «Назад» still finds it.
 *
 * Keys: Ctrl/⌘+Enter — принять; Alt+↓ / Alt+↑ — следующий / предыдущий (and → / ← outside a text
 * field); Esc — back to the list (through lib/overlay-stack, so an open confirm closes first).
 */
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, PartyPopper, SkipForward, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, type TrLocale } from "@/lib/api";
import { cn } from "@/lib/cn";
import { isTopLayer, useOverlayLayer } from "@/lib/overlay-stack";
import { checkTranslation, wordDiff, type UniqueString, type WorkSet } from "@/lib/translation-check";
import { currentText, langState, placeOf, prevSourceOf, type Bucket } from "@/lib/translation-queue";
import { invalidateTranslations, patchTranslations } from "@/lib/translations";
import { useToast } from "@/lib/toast";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { acceptText, resetText } from "@/components/translations/actions";
import { Diff, IssueList, Kbd, KindBadge, ProductLink, SourceText, StateChip } from "@/components/translations/shared";

const LANG_NAME: Record<TrLocale, string> = { uk: "Українська", en: "English" };

const STATE_HINT: Record<Bucket, string> = {
  missing: "Перевода нет — покупатель видит русский текст.",
  stale: "Перевод сделан для прежнего оригинала и сейчас скрыт. Если он всё ещё верен — просто «Принять».",
  review: "Перевод ИИ, его никто не проверял. Покупатель уже видит этот текст.",
  done: "",
};

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable;
}

export function TranslationReview({
  ws,
  queue,
  start,
  langs,
  title,
  onClose,
}: {
  ws: WorkSet;
  /** Source hashes of the texts, in the order of the list. */
  queue: string[];
  start: number;
  langs: TrLocale[];
  /** Name of the tab the queue came from. */
  title: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { push } = useToast();
  const [confirm, confirmUi] = useConfirm();
  const byHash = useMemo(() => new Map(ws.strings.map((s) => [s.sourceHash, s])), [ws]);
  const [index, setIndex] = useState(Math.min(start, queue.length - 1));
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ hash: string; text: Partial<Record<TrLocale, string>> }>({ hash: "", text: {} });
  const [showCurrent, setShowCurrent] = useState(false);
  const fieldRefs = useRef<Partial<Record<TrLocale, HTMLTextAreaElement | null>>>({});
  const topRef = useRef<HTMLDivElement>(null);

  const hash = queue[index];
  const s = byHash.get(hash);
  const base = (l: TrLocale) => (s ? currentText(s, l) : "");
  const value = (l: TrLocale) => (draft.hash === hash && draft.text[l] !== undefined ? draft.text[l]! : base(l));
  const edited = (l: TrLocale) => value(l) !== base(l);
  const dirty = !!s && langs.some(edited);

  async function guard(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({
      title: "Правка не сохранена",
      message: "Введённый текст пропадёт. Перейти без сохранения?",
      confirmLabel: "Не сохранять",
      danger: true,
    });
  }

  function show(i: number) {
    setIndex(i);
    setFinished(false);
    setShowCurrent(false);
    setDraft({ hash: "", text: {} });
    topRef.current?.scrollIntoView({ block: "start" });
  }

  async function go(i: number) {
    if (i < 0 || i >= queue.length || busy) return;
    if (!(await guard())) return;
    show(i);
  }

  async function leave() {
    if (await guard()) onClose();
  }

  function advance() {
    if (index < queue.length - 1) show(index + 1);
    else setFinished(true);
  }

  async function accept() {
    if (!s || busy || finished) return;
    const texts: Partial<Record<TrLocale, string>> = {};
    const own: Partial<Record<TrLocale, boolean>> = {};
    for (const l of langs) {
      const v = value(l);
      if (!v.trim()) {
        push(`Впишите перевод ${l.toUpperCase()} — пустой сохранить нельзя`, "error");
        fieldRefs.current[l]?.focus();
        return;
      }
      texts[l] = v;
      own[l] = edited(l);
    }
    if (langs.every((l) => !own[l] && langState(s, l) === "done")) {
      advance();
      return;
    }
    const errors = langs.flatMap((l) =>
      checkTranslation(s.source, l, texts[l]!)
        .filter((i) => i.level === "error")
        .map((i) => `${l.toUpperCase()}: ${i.text}`)
    );
    if (
      errors.length &&
      !(await confirm({
        title: "Сохранить с замечаниями?",
        message: (
          <div>
            <p className="mb-2">Автопроверка нашла проблемы — обычно это ошибка перевода:</p>
            <ul className="flex flex-col gap-0.5 font-semibold text-[var(--danger-ink)]">
              {errors.slice(0, 6).map((e) => (
                <li key={e}>✕ {e}</li>
              ))}
            </ul>
          </div>
        ),
        confirmLabel: "Сохранить всё равно",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const r = await acceptText(s, texts, own);
      if (r.outdated || r.failed) {
        invalidateTranslations(qc);
        push(
          r.outdated
            ? "Оригинал изменили, пока вы смотрели. Список обновлён — проверьте текст ещё раз."
            : `Не сохранено мест: ${r.failed}. Обновите страницу.`,
          "error"
        );
        return;
      }
      patchTranslations(
        qc,
        langs.flatMap((l) =>
          s.fields.map((f) => ({
            entityType: f.entityType,
            entityId: f.entityId,
            field: f.field,
            locale: l,
            text: texts[l]!,
            origin: own[l] ? ("MANUAL" as const) : (f.origin[l] ?? "AI"),
          }))
        )
      );
      push(langs.some((l) => own[l]) ? "Перевод сохранён" : "Принято", "ok");
      advance();
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось сохранить", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: TrLocale) {
    if (!s || busy) return;
    const ok = await confirm({
      title: `Удалить перевод ${l.toUpperCase()}?`,
      message:
        s.fields.length > 1
          ? `Перевод удалится во всех ${s.fields.length} местах с этим текстом — покупатели увидят русский оригинал.`
          : "Покупатели увидят русский оригинал, текст вернётся во вкладку «Нужно перевести».",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await resetText(s, l);
      setDraft({ hash, text: { ...draft.text, [l]: "" } });
      invalidateTranslations(qc);
      push("Перевод удалён", "ok");
    } catch (e) {
      push(e instanceof ApiError ? e.message : "Не удалось удалить", "error");
    } finally {
      setBusy(false);
    }
  }

  // Esc: back to the list. The layer also tells whether a confirm is open on top (no hotkeys then).
  const layer = useOverlayLayer(true, () => void leave(), { lockScroll: false });
  const keys = useRef({ accept, go, index });
  keys.current = { accept, go, index };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isTopLayer(layer) || e.isComposing) return;
      const k = keys.current;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void k.accept();
      } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        void k.go(k.index + (e.key === "ArrowDown" ? 1 : -1));
      } else if (!isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        void k.go(k.index + (e.key === "ArrowRight" ? 1 : -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer]);

  const prev = s ? prevSourceOf(s, langs) : null;
  const diff = useMemo(() => (s && prev ? wordDiff(prev, s.source) : null), [s, prev]);
  const anyStale = !!s && langs.some((l) => langState(s, l) === "stale");
  const allDone = !!s && langs.every((l) => langState(s, l) === "done");
  const anyMissing = !!s && langs.some((l) => langState(s, l) === "missing");
  const primaryLabel = dirty || anyMissing ? "Сохранить и дальше" : allDone ? "Дальше" : "Принять и дальше";

  return (
    <div ref={topRef} className="scroll-mt-4">
      {/* ---- top bar ---- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => void leave()}>
          К списку
        </Button>
        <div className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {title} · <span className="tabular text-[var(--text)]">{Math.min(index + 1, queue.length)}</span> из{" "}
          <span className="tabular">{queue.length}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Предыдущий" icon={<ChevronLeft className="h-4 w-4" />} disabled={index === 0 || busy} onClick={() => void go(index - 1)} />
          <Button variant="outline" size="sm" aria-label="Следующий" icon={<ChevronRight className="h-4 w-4" />} disabled={index >= queue.length - 1 || busy} onClick={() => void go(index + 1)} />
        </div>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${((finished ? queue.length : index) / Math.max(1, queue.length)) * 100}%` }} />
      </div>

      {finished ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <PartyPopper className="h-9 w-9 text-[var(--accent-hi)]" />
          <div className="section-title !text-[16px] text-[var(--ink)]">Очередь пройдена</div>
          <p className="max-w-md text-[13px] text-[var(--text-muted)]">
            Просмотрено {queue.length} {plural(queue.length, "текст", "текста", "текстов")} из «{title}». Пропущенные остались в своих вкладках.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="accent" onClick={onClose}>
              К списку
            </Button>
            <Button variant="ghost" onClick={() => show(0)}>
              Пройти ещё раз
            </Button>
          </div>
        </div>
      ) : !s ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="section-title text-[var(--ink)]">Этого текста больше нет</div>
          <p className="max-w-md text-[13px] text-[var(--text-muted)]">
            Оригинал изменили или товар скрыли, пока открыт просмотр. Новый вариант текста — в списке.
          </p>
          <Button variant="outline" icon={<SkipForward className="h-4 w-4" />} onClick={advance}>
            Дальше
          </Button>
        </div>
      ) : (
        <div className="card p-4 sm:p-5">
          <Context s={s} />

          <div className={cn("grid gap-4 lg:grid-cols-2", langs.length === 2 && "2xl:grid-cols-3")}>
            {/* ---- original ---- */}
            <section className="min-w-0 lg:row-span-2 2xl:row-span-1">
              <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-2">
                <span className="field-label !mb-0">Оригинал · RU</span>
                {diff && (
                  <div className="ml-auto inline-flex rounded-[var(--r-sm)] border border-[var(--line)] bg-[var(--bg-2)] p-0.5 text-[11px] font-semibold">
                    {(
                      [
                        [false, "Что изменилось"],
                        [true, "Текущий текст"],
                      ] as const
                    ).map(([cur, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setShowCurrent(cur)}
                        className={cn(
                          "rounded-[3px] px-2 py-0.5 transition-colors",
                          showCurrent === cur ? "bg-[var(--surface-3)] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5">
                {diff && !showCurrent ? <Diff parts={diff} /> : <SourceText text={s.source} clamp={false} />}
              </div>
              {anyStale && (
                <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-faint)]">
                  {diff
                    ? "Оригинал изменили после перевода: зачёркнуто — как было, подсвечено — как стало."
                    : prev
                      ? "Оригинал изменили после перевода."
                      : "Оригинал изменили после перевода; каким он был раньше, неизвестно — перевод старше этой функции. Сверьте перевод с текущим текстом."}
                </p>
              )}
            </section>

            {/* ---- translations ---- */}
            {langs.map((l) => {
              const st = langState(s, l);
              const v = value(l);
              const issues = v.trim() ? checkTranslation(s.source, l, v) : [];
              const texts = new Set(s.fields.map((f) => f.text[l]).filter((t): t is string => !!t));
              const own = s.fields.some((f) => f.origin[l] === "MANUAL" && f.text[l]);
              const hasAny = texts.size > 0;
              return (
                <section key={l} className="min-w-0">
                  <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-2">
                    <label htmlFor={`tr-${l}`} className="field-label !mb-0">
                      {l.toUpperCase()} · {LANG_NAME[l]}
                    </label>
                    {edited(l) ? (
                      <Badge tone="accent" className="!px-2 !text-[10px] !leading-[16px]">
                        изменён
                      </Badge>
                    ) : (
                      <StateChip state={st} />
                    )}
                    {own && !edited(l) && <span className="text-[11px] font-semibold text-[var(--text-faint)]">ваш текст</span>}
                  </div>
                  <textarea
                    id={`tr-${l}`}
                    ref={(el) => {
                      fieldRefs.current[l] = el;
                    }}
                    value={v}
                    onChange={(e) => setDraft({ hash, text: { ...(draft.hash === hash ? draft.text : {}), [l]: e.target.value } })}
                    rows={Math.min(16, Math.max(3, v.split("\n").length + Math.floor(v.length / 80) + 1))}
                    placeholder={st === "missing" ? "Впишите перевод…" : undefined}
                    className={cn(
                      "thin-scroll w-full resize-y rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 py-2.5 text-[13.5px] leading-relaxed text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]",
                      issues.some((i) => i.level === "error") ? "border-[color-mix(in_srgb,var(--danger)_60%,transparent)]" : "border-[var(--line)]",
                      st === "stale" && !edited(l) && "text-[var(--text-muted)]"
                    )}
                  />
                  <IssueList issues={issues} />
                  {!edited(l) && STATE_HINT[st] && <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-faint)]">{STATE_HINT[st]}</p>}
                  {texts.size > 1 && (
                    <p className="mt-1.5 text-[12px] font-semibold leading-snug text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
                      В разных местах этот текст переведён по-разному — сохранится показанный вариант во всех.
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-3">
                    {edited(l) && (
                      <button
                        type="button"
                        onClick={() => setDraft({ hash, text: { ...draft.text, [l]: undefined } })}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Вернуть как было
                      </button>
                    )}
                    {hasAny && !edited(l) && (
                      <button
                        type="button"
                        onClick={() => void remove(l)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-faint)] hover:text-[var(--danger-ink)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Удалить перевод
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- actions ---- */}
      {!finished && s && (
        <div
          style={{ bottom: "var(--bottom-nav)" }}
          className="sticky z-10 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--r-lg)] sm:border sm:px-4 lg:bottom-3"
        >
          <Button variant="accent" chamfer icon={<Check className="h-4 w-4" />} loading={busy} onClick={() => void accept()}>
            {primaryLabel}
          </Button>
          <Button variant="outline" icon={<SkipForward className="h-4 w-4" />} disabled={busy} onClick={() => void go(index + 1)} className={index >= queue.length - 1 ? "hidden" : undefined}>
            Пропустить
          </Button>
          <div className="ml-auto hidden items-center gap-3 text-[11.5px] text-[var(--text-faint)] md:flex">
            <span className="flex items-center gap-1">
              <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> принять
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> листать
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> к списку
            </span>
          </div>
        </div>
      )}
      {confirmUi}
    </div>
  );
}

/** Kind of text + where it is used (products open in the editor in a new tab). */
function Context({ s }: { s: UniqueString }) {
  const places = useMemo(() => {
    const seen = new Map<string, { productId: string | null; label: string; title: string | null }>();
    for (const f of s.fields) {
      const key = f.productId ?? `${f.entityType}:${f.entityId}`;
      if (!seen.has(key)) seen.set(key, { productId: f.productId, label: placeOf(f), title: f.productTitle });
    }
    return Array.from(seen.values());
  }, [s]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <KindBadge kindKey={s.kindKey} />
      {places.slice(0, 4).map((p, i) =>
        p.productId ? (
          <ProductLink key={i} productId={p.productId} title={p.title} />
        ) : (
          <span key={i} className="text-[12px] font-semibold text-[var(--text-muted)]">
            {p.label}
          </span>
        )
      )}
      {places.length > 4 && <span className="text-[12px] text-[var(--text-faint)]">и ещё {places.length - 4}</span>}
      {s.fields.length > 1 && (
        <span className="text-[12px] text-[var(--text-faint)]">
          · текст используется в {s.fields.length} {plural(s.fields.length, "месте", "местах", "местах")} — перевод сохранится везде
        </span>
      )}
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
