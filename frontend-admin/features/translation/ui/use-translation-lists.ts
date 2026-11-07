"use client";

/**
 * Фильтры экрана «Переводы» и списки по вкладкам: вкладка, язык, тип текста, поиск и «Встроенный ИИ» (только черновики,
 * которые написал встроенный ИИ и которые ждут человека; действует на вкладке «Проверить ИИ»). Из этого же состояния
 * считаются `list` — что сейчас показывает экран — и `filtered` — есть ли активный фильтр.
 */
import { useEffect, useMemo, useState } from "react";
import { useDebounced } from "@/lib/use-debounced";
import { BUCKETS, hasBuiltinAiDraft, langsOf, splitByBucket, type Bucket, type LangScope, type TypeFilter } from "../model/queue";
import type { WorkSet } from "../model/workset";

export type TranslationLists = ReturnType<typeof useTranslationLists>;

export function useTranslationLists(ws: WorkSet | null) {
  const [tab, setTab] = useState<Bucket | null>(null);
  const [scope, setScope] = useState<LangScope>("all");
  const [type, setType] = useState<TypeFilter>("");
  const [q, setQ] = useState("");
  const [builtinOnly, setBuiltinOnly] = useState(false);
  const dq = useDebounced(q, 200).trim().toLowerCase();
  const langs = langsOf(scope);

  const byBucket = useMemo(() => splitByBucket(ws?.strings ?? [], langsOf(scope), type, dq), [ws, scope, type, dq]);

  // First visit: open the first tab that has work.
  useEffect(() => {
    if (tab || !ws) return;
    setTab(BUCKETS.find((b) => byBucket[b].length > 0) ?? "missing");
  }, [ws, tab, byBucket]);

  const active: Bucket = tab ?? "missing";
  const builtinList = useMemo(() => byBucket.review.filter((s) => hasBuiltinAiDraft(s, langs)), [byBucket, langs]);
  const onlyBuiltin = builtinOnly && active === "review";
  const list = onlyBuiltin ? builtinList : byBucket[active];

  return {
    tab,
    setTab,
    scope,
    setScope,
    type,
    setType,
    q,
    setQ,
    dq,
    langs,
    byBucket,
    active,
    list,
    builtinCount: builtinList.length,
    onlyBuiltin,
    setBuiltinOnly,
    filtered: !!(type || dq || onlyBuiltin),
    /** Ключ, который меняется вместе с любым фильтром (сброс выбора и перерисовка списка). */
    key: `${active}|${scope}|${type}|${dq}|${onlyBuiltin}`,
  };
}
