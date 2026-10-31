"use client";

import { Badge } from "@/components/ui/Badge";
import { WRITEOFF_LABEL } from "../model/writeoffs";
import type { WriteoffLine } from "../model/types";
import { leftOf } from "../model/writeoffs";

/** «вернули N» under the quantity of a row partly or fully put back on the shelf. */
export function Undone({ l }: { l: WriteoffLine }) {
  if (!l.undoneQty) return null;
  return (
    <span className="block text-[11.5px] font-normal text-[var(--ok)]" title={l.undoneNote ?? undefined}>
      вернули {l.undoneQty}
    </span>
  );
}

/** «Вернуть на склад» — только пока что-то ещё числится списанным. */
export function RestoreButton({ l, onClick }: { l: WriteoffLine; onClick: () => void }) {
  if (leftOf(l) <= 0) return null;
  return (
    <button type="button" onClick={onClick} className="text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline">
      Вернуть на склад
    </button>
  );
}

export function Reason({ l }: { l: WriteoffLine }) {
  return <Badge tone={l.reason === "DEFECT" ? "danger" : "neutral"}>{WRITEOFF_LABEL[l.reason] ?? l.reason}</Badge>;
}
