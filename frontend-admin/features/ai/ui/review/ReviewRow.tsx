"use client";

import { ExternalLink, Lock, Pencil } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { confidenceColor } from "../../model/confidence";
import { applicable, groupOf, type ReviewField } from "../../model/review-model";
import { ReviewEdit } from "./ReviewEdit";

/**
 * Одна строка ревью: флажок, «было → стало», точка уверенности, причина сомнения, источник; у правимых полей — карандаш
 * (поправленное помечено «изменено вами» и в исходе считается «с правками»).
 */
export function ReviewRow({
  field,
  checked,
  onToggle,
  onEdit,
}: {
  field: ReviewField;
  checked: boolean;
  onToggle: () => void;
  /** Правка значения: текст ошибки или null (принято). Нет — строку не правят. */
  onEdit?: (value: string) => string | null;
}) {
  const [editing, setEditing] = useState(false);
  const can = applicable(field);
  const canEdit = !!onEdit && !!field.editable && groupOf(field) !== "locked";
  return (
    <li className="border-t border-[var(--line)] first:border-t-0">
      <div className="flex min-w-0 items-start">
        <label className={cn("flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5", can ? "cursor-pointer" : "cursor-default opacity-90")}>
          {can ? (
            <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" aria-label={`Применить: ${field.label}`} />
          ) : (
            <Lock className="mt-1 h-4 w-4 shrink-0 text-[var(--text-faint)]" aria-hidden />
          )}
          <RowBody field={field} />
        </label>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Изменить: ${field.label}`}
            title="Поправить значение"
            className="nb-press grid h-11 w-11 shrink-0 place-items-center text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      {editing && onEdit && (
        <ReviewEdit
          field={field}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            const error = onEdit(v);
            if (!error) setEditing(false);
            return error;
          }}
        />
      )}
    </li>
  );
}

function RowBody({ field }: { field: ReviewField }) {
  const bad = field.suspicion === "bad";
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold text-[var(--ink)]">{field.label}</span>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: confidenceColor(field.confidence) }} />
        {field.edited && <span className="shrink-0 text-[11.5px] font-semibold text-[var(--accent)]">изменено вами</span>}
      </div>
      <div className="mt-0.5 break-words text-[13px] leading-snug">
        {field.before !== null && <span className="text-[var(--text-muted)] line-through decoration-[var(--text-faint)]">{field.before}</span>}
        {field.before !== null && <span className="px-1.5 text-[var(--text-faint)]">→</span>}
        <span className={cn("font-medium", bad ? "text-[var(--danger-ink)]" : "text-[var(--text)]")}>{field.after}</span>
      </div>
      <RowNote field={field} />
      {field.source && (
        <a href={field.source} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex max-w-full items-center gap-1 text-[11.5px] text-[var(--accent)]" onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{hostOf(field.source)}</span>
        </a>
      )}
    </div>
  );
}

/** Причина сомнения, конфликт или замок — одной строкой под значением. */
function RowNote({ field }: { field: ReviewField }) {
  const text = field.conflict ?? field.reason ?? field.lockNote;
  if (!text) return null;
  const bad = field.suspicion === "bad";
  const warn = field.suspicion === "warn" || !!field.conflict;
  return (
    <p className={cn("mt-1 text-[12px] leading-snug", bad ? "text-[var(--danger-ink)]" : warn ? "text-[var(--warn)]" : "text-[var(--text-muted)]")}>
      {text}
      {bad && " Применить нельзя."}
    </p>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
