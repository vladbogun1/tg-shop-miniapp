import { formatDateTime } from "@shop/core/time";
import { money } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { OrderWriteoff } from "../../model/types";

/** «Списано как брак» с кнопкой «Вернуть на склад» (V70) у тех, что ещё числятся списанными. */
export function WriteoffList({
  writeoffs,
  cur,
  onRestore,
}: {
  writeoffs: OrderWriteoff[];
  cur: string;
  onRestore: (w: { id: number; title: string; left: number }) => void;
}) {
  return (
    <div className="mt-3 border-t border-[var(--line)] pt-3">
      <div className="field-label mb-1.5">Списано как брак</div>
      <ul className="flex flex-col gap-1 text-[12.5px] text-[var(--text-muted)]">
        {writeoffs.map((w, i) => {
          const undone = w.undoneQty ?? 0;
          const left = w.quantity - undone;
          return (
            <li key={w.id || i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 flex-1">
                <span className={cn("text-[var(--text)]", left <= 0 && "line-through opacity-60")}>
                  {w.title} ×{w.quantity}
                </span>
                {w.unitValueMinor > 0 && left > 0 && <> · {money(w.unitValueMinor * left, cur)}</>}
                {w.reason && <> · {w.reason}</>}
                {w.note && <> · {w.note}</>}
                {undone > 0 && (
                  <span className="text-[var(--ok)]">
                    {" "}
                    · вернули {undone} шт
                    {w.undoneNote ? ` (${w.undoneNote})` : ""}
                  </span>
                )}
                <span className="text-[var(--text-faint)]">
                  {" "}
                  · {formatDateTime(w.createdAt)}
                  {w.adminName && ` · ${w.adminName}`}
                </span>
              </span>
              {left > 0 && w.id > 0 && (
                <button
                  type="button"
                  onClick={() => onRestore({ id: w.id, title: w.title, left })}
                  className="shrink-0 text-[12.5px] font-semibold text-[var(--accent-hi)] hover:underline"
                >
                  Вернуть на склад
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
