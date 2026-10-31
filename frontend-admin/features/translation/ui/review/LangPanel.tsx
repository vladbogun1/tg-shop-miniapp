"use client";

/** Просмотр по одному: поле перевода одного языка — правка на месте, замечания, «Вернуть»/«Удалить». */
import { Trash2, Undo2 } from "lucide-react";
import type { Ref } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { checkTranslation } from "../../model/check";
import { langState, type Bucket } from "../../model/queue";
import type { TrLocale } from "../../model/types";
import type { UniqueString } from "../../model/workset";
import { IssueList, StateChip } from "../shared";

const LANG_NAME: Record<TrLocale, string> = { uk: "Українська", en: "English" };

const STATE_HINT: Record<Bucket, string> = {
  missing: "Перевода нет — покупатель видит русский текст.",
  stale: "Перевод сделан для прежнего оригинала и сейчас скрыт. Если он всё ещё верен — просто «Принять».",
  review: "Перевод ИИ, его никто не проверял. Покупатель уже видит этот текст.",
  done: "",
};

export function LangPanel({
  l,
  s,
  value,
  edited,
  busy,
  fieldRef,
  onChange,
  onRevert,
  onRemove,
}: {
  l: TrLocale;
  s: UniqueString;
  value: string;
  edited: boolean;
  busy: boolean;
  fieldRef: Ref<HTMLTextAreaElement>;
  onChange: (text: string) => void;
  onRevert: () => void;
  onRemove: () => void;
}) {
  const st = langState(s, l);
  const issues = value.trim() ? checkTranslation(s.source, l, value) : [];
  const texts = new Set(s.fields.map((f) => f.text[l]).filter((t): t is string => !!t));
  const own = s.fields.some((f) => f.origin[l] === "MANUAL" && f.text[l]);
  const hasAny = texts.size > 0;
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-2">
        <label htmlFor={`tr-${l}`} className="field-label !mb-0">
          {l.toUpperCase()} · {LANG_NAME[l]}
        </label>
        {edited ? (
          <Badge tone="accent" className="!px-2 !text-[10px] !leading-[16px]">
            изменён
          </Badge>
        ) : (
          <StateChip state={st} />
        )}
        {own && !edited && <span className="text-[11px] font-semibold text-[var(--text-faint)]">ваш текст</span>}
      </div>
      <textarea
        id={`tr-${l}`}
        ref={fieldRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(16, Math.max(3, value.split("\n").length + Math.floor(value.length / 80) + 1))}
        placeholder={st === "missing" ? "Впишите перевод…" : undefined}
        className={cn(
          "thin-scroll w-full resize-y rounded-[var(--r-md)] border bg-[var(--surface-2)] px-3 py-2.5 text-[13.5px] leading-relaxed text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] focus:shadow-[var(--ring-accent)]",
          issues.some((i) => i.level === "error") ? "border-[color-mix(in_srgb,var(--danger)_60%,transparent)]" : "border-[var(--line)]",
          st === "stale" && !edited && "text-[var(--text-muted)]"
        )}
      />
      <IssueList issues={issues} />
      {!edited && STATE_HINT[st] && <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-faint)]">{STATE_HINT[st]}</p>}
      {texts.size > 1 && (
        <p className="mt-1.5 text-[12px] font-semibold leading-snug text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
          В разных местах этот текст переведён по-разному — сохранится показанный вариант во всех.
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-3">
        {edited && (
          <button
            type="button"
            onClick={onRevert}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Undo2 className="h-3.5 w-3.5" /> Вернуть как было
          </button>
        )}
        {hasAny && !edited && (
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--text-faint)] hover:text-[var(--danger-ink)]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Удалить перевод
          </button>
        )}
      </div>
    </section>
  );
}
