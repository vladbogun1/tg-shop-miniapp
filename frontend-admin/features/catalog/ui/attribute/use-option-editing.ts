"use client";

import { toast } from "@shop/ui/toast";
import { useEffect, useState } from "react";
import type { Draft, OptRow } from "../../model/attribute-draft";
import type { AdminSpecAttribute } from "../../model/types";
import { useMergeOption } from "../../queries";

export interface OptionEditing {
  mergeFor: string | null;
  setMergeFor: (uid: string | null) => void;
  mergeTarget: string;
  setMergeTarget: (v: string) => void;
  merging: boolean;
  /** Options removed although products use them — the save then needs force. */
  forcedRemovals: string[];
  updateOpt: (i: number, patch: Partial<OptRow>) => void;
  moveOpt: (i: number, to: number) => void;
  removeOpt: (i: number) => void;
  doMerge: (o: OptRow) => void;
  forceRemove: (o: OptRow) => void;
}

/** Правки списка опций в черновике: порядок, удаление, «объединить с…», принудительное удаление. */
export function useOptionEditing(
  open: boolean,
  attribute: AdminSpecAttribute | null,
  d: Draft,
  setD: (f: (p: Draft) => Draft) => void,
  used: number
): OptionEditing {
  const [mergeFor, setMergeFor] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [forcedRemovals, setForcedRemovals] = useState<string[]>([]);
  const merge = useMergeOption();

  useEffect(() => {
    if (!open) return;
    setMergeFor(null);
    setForcedRemovals([]);
  }, [open, attribute]);

  function updateOpt(i: number, patch: Partial<OptRow>) {
    setD((p) => ({ ...p, options: p.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  }
  function moveOpt(i: number, to: number) {
    setD((p) => {
      if (to < 0 || to >= p.options.length) return p;
      const next = [...p.options];
      const [m] = next.splice(i, 1);
      next.splice(to, 0, m);
      return { ...p, options: next };
    });
  }
  function removeOpt(i: number) {
    const o = d.options[i];
    const inUse = !!o.original && (o.usedCount ?? (used > 0 ? -1 : 0)) !== 0;
    if (inUse) {
      setMergeFor(o.uid);
      setMergeTarget("");
      return;
    }
    setD((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }));
  }

  function doMerge(o: OptRow) {
    if (!attribute || !o.original || !mergeTarget) return;
    merge.mutate(
      { attributeId: attribute.id, from: o.original, to: mergeTarget },
      {
        onSuccess: () => {
          const target = d.options.find((x) => x.value === mergeTarget);
          // The merged spelling keeps recognising: its label and aliases become aliases of the target.
          setD((p) => ({
            ...p,
            options: p.options
              .filter((x) => x.uid !== o.uid)
              .map((x) =>
                x.value === mergeTarget
                  ? { ...x, aliases: [...new Set([...x.aliases, o.labelRu, o.value, ...o.aliases].filter(Boolean))] }
                  : x
              ),
          }));
          setMergeFor(null);
          toast.success(`«${o.labelRu}» объединена с «${target?.labelRu ?? mergeTarget}» — сохраните характеристику`);
        },
      }
    );
  }

  function forceRemove(o: OptRow) {
    setForcedRemovals((p) => [...p, o.value]);
    setD((p) => ({ ...p, options: p.options.filter((x) => x.uid !== o.uid) }));
    setMergeFor(null);
  }

  return {
    mergeFor,
    setMergeFor,
    mergeTarget,
    setMergeTarget,
    merging: merge.isPending,
    forcedRemovals,
    updateOpt,
    moveOpt,
    removeOpt,
    doMerge,
    forceRemove,
  };
}
