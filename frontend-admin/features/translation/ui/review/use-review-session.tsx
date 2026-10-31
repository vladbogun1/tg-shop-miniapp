"use client";

/**
 * Состояние просмотра по одному: позиция в очереди, черновики правок, «Принять»/«Удалить», горячие клавиши.
 *
 * Очередь (тексты в порядке списка) замораживается при открытии: принятый текст уходит в другую вкладку,
 * но «Назад» его находит.
 *
 * Клавиши: Ctrl/⌘+Enter — принять; Alt+↓ / Alt+↑ — следующий / предыдущий (и → / ← вне поля ввода);
 * Esc — к списку (через overlay-слой, поэтому открытое подтверждение закрывается первым).
 */
import { useConfirm } from "@shop/ui/confirm";
import { isTopLayer, useOverlayLayer } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { useEffect, useMemo, useRef, useState } from "react";
import { blockingIssues } from "../../model/check";
import { currentText, langState, prevSourceOf } from "../../model/queue";
import { wordDiff } from "../../model/diff";
import type { TrLocale } from "../../model/types";
import type { WorkSet } from "../../model/workset";
import { useAcceptText, useResetText } from "../../queries";

type Draft = { hash: string; text: Partial<Record<TrLocale, string>> };

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.tagName === "SELECT" || el.isContentEditable;
}

type KeyAction = "accept" | "next" | "prev" | null;

function keyAction(e: KeyboardEvent): KeyAction {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "Enter") return "accept";
  if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) return e.key === "ArrowDown" ? "next" : "prev";
  if (!isTyping(e.target) && !mod && !e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    return e.key === "ArrowRight" ? "next" : "prev";
  }
  return null;
}

interface Params {
  ws: WorkSet;
  /** Source hashes of the texts, in the order of the list. */
  queue: string[];
  start: number;
  langs: TrLocale[];
  onClose: () => void;
}

export function useReviewSession({ ws, queue, start, langs, onClose }: Params) {
  const confirm = useConfirm();
  const byHash = useMemo(() => new Map(ws.strings.map((s) => [s.sourceHash, s])), [ws]);
  const [index, setIndex] = useState(Math.min(start, queue.length - 1));
  const [finished, setFinished] = useState(false);
  const [draft, setDraft] = useState<Draft>({ hash: "", text: {} });
  const [showCurrent, setShowCurrent] = useState(false);
  const fieldRefs = useRef<Partial<Record<TrLocale, HTMLTextAreaElement | null>>>({});
  const topRef = useRef<HTMLDivElement>(null);

  const hash = queue[index];
  const s = byHash.get(hash);
  const base = (l: TrLocale) => (s ? currentText(s, l) : "");
  const value = (l: TrLocale) => (draft.hash === hash && draft.text[l] !== undefined ? draft.text[l]! : base(l));
  const edited = (l: TrLocale) => value(l) !== base(l);
  const dirty = !!s && langs.some(edited);

  function show(i: number) {
    setIndex(i);
    setFinished(false);
    setShowCurrent(false);
    setDraft({ hash: "", text: {} });
    topRef.current?.scrollIntoView({ block: "start" });
  }

  function advance() {
    if (index < queue.length - 1) show(index + 1);
    else setFinished(true);
  }

  const acceptM = useAcceptText(advance);
  const resetM = useResetText((l) => setDraft({ hash, text: { ...draft.text, [l]: "" } }));
  const busy = acceptM.isPending || resetM.isPending;

  async function guard(): Promise<boolean> {
    if (!dirty) return true;
    return confirm({
      title: "Правка не сохранена",
      message: "Введённый текст пропадёт. Перейти без сохранения?",
      confirmLabel: "Не сохранять",
      danger: true,
    });
  }

  async function go(i: number) {
    if (i < 0 || i >= queue.length || busy) return;
    if (!(await guard())) return;
    show(i);
  }

  async function leave() {
    if (await guard()) onClose();
  }

  async function confirmWithErrors(errors: string[]): Promise<boolean> {
    if (!errors.length) return true;
    return confirm({
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
    });
  }

  async function accept() {
    if (!s || busy || finished) return;
    const texts: Partial<Record<TrLocale, string>> = {};
    const own: Partial<Record<TrLocale, boolean>> = {};
    for (const l of langs) {
      const v = value(l);
      if (!v.trim()) {
        toast.error(`Впишите перевод ${l.toUpperCase()} — пустой сохранить нельзя`);
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
    if (!(await confirmWithErrors(blockingIssues(s.source, langs, texts)))) return;
    acceptM.mutate({ s, langs, texts, own });
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
    if (ok) resetM.mutate({ s, l });
  }

  // Esc: back to the list. The layer also tells whether a confirm is open on top (no hotkeys then).
  const layer = useOverlayLayer(true, () => void leave(), { lockScroll: false });
  const keys = useRef({ accept, go, index });
  keys.current = { accept, go, index };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isTopLayer(layer) || e.isComposing) return;
      const action = keyAction(e);
      if (!action) return;
      e.preventDefault();
      const k = keys.current;
      if (action === "accept") void k.accept();
      else void k.go(k.index + (action === "next" ? 1 : -1));
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

  return {
    s,
    index,
    finished,
    busy,
    showCurrent,
    setShowCurrent,
    topRef,
    fieldRefs,
    value,
    edited,
    setText: (l: TrLocale, text: string | undefined) =>
      setDraft({ hash, text: { ...(text === undefined ? draft.text : draft.hash === hash ? draft.text : {}), [l]: text } }),
    prev,
    diff,
    anyStale,
    primaryLabel,
    show,
    advance,
    go,
    leave,
    accept,
    remove,
  };
}
