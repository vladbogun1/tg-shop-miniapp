"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueueSelection } from "./TranslationQueue";

/**
 * Режим «Выбрать» списка переводов. Отметки сбрасываются, когда меняется вкладка, фильтр или поиск
 * (`resetKey`): иначе в панели осталось бы то, чего в списке уже не видно.
 */
export function useQueueSelection(resetKey: string) {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setIds(new Set()), [resetKey]);
  const toggle = useCallback((hash: string, v: boolean) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (v) next.add(hash);
      else next.delete(hash);
      return next;
    });
  }, []);
  const selection: QueueSelection | null = on ? { ids, toggle } : null;
  return {
    selectMode: on,
    toggleMode: () => {
      setOn((v) => !v);
      setIds(new Set());
    },
    ids,
    selection,
    selectAll: (hashes: string[]) => setIds(new Set(hashes)),
    clear: () => setIds(new Set()),
  };
}
