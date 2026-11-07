"use client";

import { useState } from "react";
import type { CategoryFilter } from "../../model/tree-filter";
import type { TreeSelection } from "./CategoryTree";

function toggled<T>(set: ReadonlySet<T>, v: T, on?: boolean): Set<T> {
  const next = new Set(set);
  if (on ?? !next.has(v)) next.add(v);
  else next.delete(v);
  return next;
}

/** Чипы-фильтры и режим «Выбрать» экрана категорий: что включено и что отмечено. */
export function useTreeControls() {
  const [filters, setFilters] = useState<ReadonlySet<CategoryFilter>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const selection: TreeSelection | null = selectMode ? { ids: selected, toggle: (id, on) => setSelected((p) => toggled(p, id, on)) } : null;
  return {
    filters,
    toggleFilter: (f: CategoryFilter) => setFilters((p) => toggled(p, f)),
    selectMode,
    toggleSelectMode: () => {
      setSelectMode((v) => !v);
      setSelected(new Set());
    },
    selected,
    clearSelected: () => setSelected(new Set()),
    selection,
  };
}
