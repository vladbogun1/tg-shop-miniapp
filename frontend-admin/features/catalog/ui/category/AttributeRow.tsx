"use client";

import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Globe2, Lock, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { SPEC_TYPE_LABEL } from "../../model/labels";
import type { AdminSpecAttribute } from "../../model/types";
import { productsWord } from "../../model/words";
import { RowBtn } from "./parts";

interface Props {
  a: AdminSpecAttribute;
  /** Своя характеристика категории (редактируется); иначе унаследованная. */
  mine: boolean;
  /** Откуда унаследована: «глобальная» / «из «Мыши»». */
  from: string;
  /** Место среди своих характеристик группы и их число — для стрелок порядка. */
  idx: number;
  ownInGroup: number;
  busy: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

/** Стрелки порядка, «Изменить», «Удалить» своей характеристики (пока идёт запрос — спиннер). */
function OwnControls({ busy, idx, ownInGroup, onEdit, onMove, onRemove }: Pick<Props, "busy" | "idx" | "ownInGroup" | "onEdit" | "onMove" | "onRemove">) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {busy ? (
        <Spinner className="mx-2 h-4 w-4" />
      ) : (
        <>
          <RowBtn label="Выше" disabled={idx <= 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn label="Ниже" disabled={idx < 0 || idx >= ownInGroup - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn label="Изменить" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </RowBtn>
          <RowBtn label="Удалить" danger onClick={() => onRemove()}>
            <Trash2 className="h-3.5 w-3.5" />
          </RowBtn>
        </>
      )}
    </span>
  );
}

/** Строка характеристики в списке категории. */
export function AttributeRow({ a, mine, from, idx, ownInGroup, busy, onEdit, onMove, onRemove }: Props) {
  return (
    <motion.li
      layout
      key={a.id}
      className={cn(
        "group flex items-center gap-2 border-t border-[var(--line)] px-3 py-2 first:border-t-0",
        mine ? "hover:bg-[var(--surface-hover)]" : "bg-[color-mix(in_srgb,var(--bg-2)_60%,transparent)]"
      )}
    >
      <button
        type="button"
        disabled={!mine}
        onClick={onEdit}
        className="focusable flex min-w-0 flex-1 flex-col items-start rounded-[var(--r-sm)] text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("truncate text-[14px] font-semibold", mine ? "text-[var(--text)]" : "text-[var(--text-muted)]")}>
            {a.labelRu}
            {a.unitRu ? <span className="font-normal text-[var(--text-faint)]">, {a.unitRu}</span> : null}
          </span>
          {a.required && <span className="text-[var(--accent-hi)]" title="Обязательная">*</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--text-faint)]">
          <span className="font-mono">{a.key}</span>
          <span>· {SPEC_TYPE_LABEL[a.type]}{a.range ? " (от–до)" : ""}</span>
          {(a.type === "enum" || a.type === "multi") && <span>· {a.options.length} опц.</span>}
          {!mine && (
            <span className="inline-flex items-center gap-1">
              · {a.categoryId === null && <Globe2 className="h-3 w-3" />}
              {from}
            </span>
          )}
          {a.usedCount != null && <span>· {productsWord(a.usedCount)}</span>}
        </span>
      </button>
      <span className="hidden shrink-0 items-center gap-1 sm:flex">
        {a.filterable && <Badge tone="info" className="px-1.5">фильтр</Badge>}
        {a.highlight && <Badge tone="accent" className="px-1.5">карточка</Badge>}
      </span>
      {mine ? (
        <OwnControls busy={busy} idx={idx} ownInGroup={ownInGroup} onEdit={onEdit} onMove={onMove} onRemove={onRemove} />
      ) : (
        <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--text-faint)]" aria-label="Унаследована — меняется в своей категории" />
      )}
    </motion.li>
  );
}
