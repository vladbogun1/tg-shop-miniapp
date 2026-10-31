"use client";

/** Шаг 1 мастера: какие товары берём, как делим на пакеты, какие пакеты уже скопированы. */
import { useEffect, useMemo, useRef, useState } from "react";
import { chosenFirst, matchesQuery, sortForWizard } from "../../model";
import { splitIntoBatches, type CardItem } from "../../model/item";
import { buildCardPrompt } from "../../model/prompt";
import type { CardSchema } from "../../model/schema";

interface Args {
  items: CardItem[];
  schema: CardSchema;
  ids: Map<string, string>;
  /** Products to start with; a new array = a new start. */
  preselect: string[];
}

export type BatchSize = "4" | "8";

export function useBatchSelection({ items, schema, ids, preselect }: Args) {
  const [manual, setManual] = useState<Set<string>>(() => new Set(preselect));
  const prevPreselect = useRef(preselect);
  useEffect(() => {
    // Opened again with another selection: start from it (a pasted answer stays).
    if (prevPreselect.current !== preselect) {
      prevPreselect.current = preselect;
      setManual(new Set(preselect));
    }
  }, [preselect]);
  const [query, setQuery] = useState("");
  const [showList, setShowList] = useState(false);
  const [chosenAtOpen, setChosenAtOpen] = useState<Set<string>>(() => new Set(preselect));
  const [size, setSize] = useState<BatchSize>("8");
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<number | null>(null);

  const sorted = useMemo(() => sortForWizard(items, schema), [items, schema]);
  const chosen = useMemo(() => sorted.filter((i) => manual.has(i.id)), [sorted, manual]);
  // Search over all products; the chosen ones first (the order is fixed while the list is open).
  const visibleList = useMemo(() => chosenFirst(sorted.filter((i) => matchesQuery(i, query)), chosenAtOpen), [sorted, query, chosenAtOpen]);

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

  function toggleList() {
    if (!showList) setChosenAtOpen(new Set(manual));
    setShowList(!showList);
  }

  function setChosen(id: string, on: boolean) {
    const n = new Set(manual);
    if (on) n.add(id);
    else n.delete(id);
    setManual(n);
  }

  return {
    manual, setManual, setChosen, query, setQuery, showList, toggleList, size, setSize,
    copied, markCopied: (i: number) => setCopied(new Set(copied).add(i)), preview, setPreview,
    chosen, visibleList, batches, nextBatch,
  };
}

export type BatchSelection = ReturnType<typeof useBatchSelection>;
