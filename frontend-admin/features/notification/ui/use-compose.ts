"use client";

import { useForm } from "@shop/ui/form";
import { toast } from "@shop/ui/toast";
import { sanitizeTelegramHtml, validateTelegramHtml } from "@shop/core/telegram-html";
import { useEffect, useMemo, useState } from "react";
import {
  EMPTY_COMPOSE,
  filledVersions,
  textProblems,
  textsOf,
  type ComposeValues,
  type TextKey,
} from "../model/compose";
import { draftOf, loadDraft, saveDraft, valuesFromDraft, valuesFromHistory } from "../model/draft";
import type { BroadcastHistoryItem } from "../model/types";

/**
 * Форма «Рассылки»: тексты (основной + uk/ru/en), аудитория, язык, кнопка. Черновик один раз
 * восстанавливается из localStorage, затем каждая правка пишется в него.
 */
export function useCompose() {
  const form = useForm<ComposeValues>({ defaultValues: EMPTY_COMPOSE });
  const v = form.watch();
  const [editing, setEditing] = useState<TextKey>("main");
  const [restored, setRestored] = useState(false);

  const patch = (p: Partial<ComposeValues>) => {
    for (const [k, val] of Object.entries(p)) form.setValue(k as keyof ComposeValues, val as never);
  };
  const setField = <K extends keyof ComposeValues>(k: K, val: ComposeValues[K]) => form.setValue(k, val as never);

  useEffect(() => {
    const d = loadDraft();
    if (d) form.reset({ ...EMPTY_COMPOSE, ...valuesFromDraft(d) });
    setRestored(true);
  }, [form]);
  useEffect(() => {
    if (!restored) return;
    saveDraft(draftOf({ ...EMPTY_COMPOSE, main: v.main, uk: v.uk, ru: v.ru, en: v.en, audience: v.audience, lang: v.lang, withButton: v.withButton, buttonText: v.buttonText }));
  }, [restored, v.main, v.uk, v.ru, v.en, v.audience, v.lang, v.withButton, v.buttonText]);

  const texts = useMemo(() => textsOf({ main: v.main, uk: v.uk, ru: v.ru, en: v.en }), [v.main, v.uk, v.ru, v.en]);
  const text = texts[editing];
  const setText = (next: string) => setField(editing, next);

  const problems = useMemo(() => textProblems(texts), [texts]);
  const ok = problems.length === 0 && texts.main.trim().length > 0;
  const currentProblems = useMemo(() => validateTelegramHtml(text), [text]);
  /** What the preview shows: the edited version, or the main text it falls back to. */
  const previewSource = text.trim() ? text : texts.main;
  const previewHtml = useMemo(() => sanitizeTelegramHtml(previewSource), [previewSource]);
  const versions = filledVersions(texts);

  function resetTexts() {
    patch({ main: "", uk: "", ru: "", en: "" });
    setEditing("main");
  }

  function clearDraft() {
    patch({ main: "", uk: "", ru: "", en: "", buttonText: "" });
    setEditing("main");
  }

  function reuse(h: BroadcastHistoryItem) {
    patch(valuesFromHistory(h));
    setEditing("main");
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("Текст рассылки загружен в черновик");
  }

  /** Обернуть выделенное в теге (или дописать пару тегов в конец). */
  function wrap(open: string, close: string) {
    const ta = document.getElementById("bcast-ta") as HTMLTextAreaElement | null;
    if (!ta) {
      setText(text + open + close);
      return;
    }
    const s = ta.selectionStart ?? text.length;
    const e = ta.selectionEnd ?? text.length;
    const sel = text.slice(s, e);
    setText(text.slice(0, s) + open + sel + close + text.slice(e));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + open.length + sel.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return {
    values: v as ComposeValues,
    texts,
    editing,
    setEditing,
    text,
    setText,
    setField,
    problems,
    ok,
    currentProblems,
    previewSource,
    previewHtml,
    versions,
    resetTexts,
    clearDraft,
    reuse,
    wrap,
  };
}

export type Compose = ReturnType<typeof useCompose>;
