"use client";

/** Состояние экрана «Карточки»: вкладка, фильтры, выбор строк, открытая панель, окна «Оформить с ИИ». */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { assignCardIds } from "../../model/item";
import { defaultTab, listForTab, pruneSelection, tabCounts, wizardLabel } from "../../model/screen";
import { bulkAcceptable, matchesVitrine, missingCount, tabOf, type CardTab, type Vitrine } from "../../model/view";
import { cardsKeys } from "../../keys";
import { invalidateCards, useCardItems, useCardSchema } from "../../queries";
import { useBulkAccept } from "./use-bulk-accept";

export const PAGE = 100;

export interface WizardState {
  open: boolean;
  preselect: string[];
  label: string;
}

export function useCardsScreen() {
  const qc = useQueryClient();
  const itemsQ = useCardItems();
  const schemaQ = useCardSchema();
  const items = useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  // Ids over ALL products: the same product keeps its "p…" id whatever is selected.
  const ids = useMemo(() => assignCardIds(items.map((i) => i.id)), [items]);

  const [tab, setTab] = useState<CardTab | null>(null);
  const [vitrine, setVitrine] = useState<Vitrine>("work");
  const [query, setQuery] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [completing, setCompleting] = useState<string | null>(null);
  const [wizard, setWizard] = useState<WizardState | null>(null);

  const counts = useMemo(() => tabCounts(items.filter((i) => matchesVitrine(i, vitrine))), [items, vitrine]);
  const current: CardTab = tab ?? defaultTab(counts);
  const list = useMemo(() => listForTab(items, { vitrine, tab: current, query, onlyIncomplete }), [items, vitrine, current, query, onlyIncomplete]);
  const incompleteReady = useMemo(
    () => items.filter((i) => matchesVitrine(i, vitrine) && tabOf(i) === "ready" && missingCount(i) > 0).length,
    [items, vitrine]
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => setSelected((prev) => pruneSelection(prev, list)), [list]);

  const selectedItems = useMemo(() => list.filter((i) => selected.has(i.id)), [list, selected]);
  const bulkOk = useMemo(() => selectedItems.filter(bulkAcceptable), [selectedItems]);
  const wizardIds = selected.size ? selectedItems.map((i) => i.id) : list.map((i) => i.id);
  const bulk = useBulkAccept({ selectedCount: selectedItems.length, bulkOk, onFinished: () => setSelected(new Set()) });

  function switchTab(t: CardTab) {
    setTab(t);
    setLimit(PAGE);
    setSelected(new Set());
  }

  function openWizard() {
    if (!wizardIds.length) return;
    setWizard({ open: true, preselect: wizardIds, label: wizardLabel(selected.size, wizardIds.length, current) });
  }

  // ---- panel navigation: by the list as it is now ----------------------------------
  const index = openId ? list.findIndex((i) => i.id === openId) : -1;
  const neighbour = useCallback(
    (step: 1 | -1) => {
      if (index < 0) return null;
      const n = list[index + step];
      return n ? () => setOpenId(n.id) : null;
    },
    [index, list]
  );
  function afterDone() {
    // The card has left this tab: show the next one (or the previous at the end of the list).
    const next = index >= 0 ? (list[index + 1] ?? list[index - 1] ?? null) : null;
    setOpenId(next ? next.id : null);
  }

  function closeCompletion() {
    setCompleting(null);
    invalidateCards(qc);
    qc.invalidateQueries({ queryKey: cardsKeys.reviewRoot() });
  }

  return {
    itemsQ, schemaQ, items, schema: schemaQ.data, ids, current, counts, list, incompleteReady,
    query, setQuery: (q: string) => { setQuery(q); setLimit(PAGE); },
    vitrine, setVitrine: (v: Vitrine) => { setVitrine(v); setLimit(PAGE); },
    onlyIncomplete, setOnlyIncomplete, resetFilters: () => { setQuery(""); setVitrine("work"); setOnlyIncomplete(false); },
    selected, setSelected, selectedItems, bulkOk, wizardIds, bulk,
    toggleRow: (id: string, on: boolean) => setSelected((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; }),
    toggleAll: (on: boolean) => setSelected(on ? new Set(list.map((i) => i.id)) : new Set()),
    openId, setOpenId, openItem: openId ? (itemById.get(openId) ?? null) : null, index, neighbour, afterDone,
    limit, showMore: () => setLimit(limit + PAGE), completing, setCompleting, closeCompletion,
    wizard, setWizard, openWizard, switchTab,
  };
}

export type CardsScreenState = ReturnType<typeof useCardsScreen>;
