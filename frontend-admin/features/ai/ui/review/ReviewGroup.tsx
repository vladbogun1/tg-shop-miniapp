"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { GROUP_TITLE, groupOpenByDefault, type GroupId, type ReviewField } from "../../model/review-model";
import { ReviewRow } from "./ReviewRow";

/** Группа ревью со счётчиком «включено из N»; «Проверьте» с красным и «Заполнено не ИИ» свёрнуты, если длинные. */
export function ReviewGroup({
  id,
  fields,
  selected,
  chosenHere,
  onToggle,
  onAll,
}: {
  id: GroupId;
  fields: ReviewField[];
  selected: ReadonlySet<string>;
  chosenHere: number;
  onToggle: (f: ReviewField) => void;
  onAll?: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(groupOpenByDefault(id, fields.length));
  const locked = id === "locked";
  const hasBad = fields.some((f) => f.suspicion === "bad");
  return (
    <section className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform", !open && "-rotate-90")} />
          <span className="min-w-0 truncate text-[13px] font-bold text-[var(--ink)]">{GROUP_TITLE[id]}</span>
          {hasBad && <span aria-label="есть красное" className="h-2 w-2 shrink-0 rounded-full bg-[var(--danger)]" />}
          <span className="shrink-0 text-[12px] text-[var(--text-muted)]">{locked ? fields.length : `${chosenHere} из ${fields.filter((f) => f.suspicion !== "bad").length}`}</span>
        </button>
        {!locked && onAll && open && (
          <button type="button" className="shrink-0 text-[12px] font-semibold text-[var(--accent)]" onClick={() => onAll(chosenHere === 0)}>
            {chosenHere === 0 ? "Выбрать все" : "Снять все"}
          </button>
        )}
      </div>
      {open && (
        <ul>
          {fields.map((f) => (
            <ReviewRow key={f.key} field={f} checked={selected.has(f.key)} onToggle={() => onToggle(f)} />
          ))}
        </ul>
      )}
    </section>
  );
}
