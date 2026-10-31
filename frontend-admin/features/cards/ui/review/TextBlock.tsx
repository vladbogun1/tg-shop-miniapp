"use client";

import { PencilLine } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Diff, InlineText, SourceText, wordDiff } from "@/features/translation";
import { TEXT_LABEL, type CardChange, type TextField } from "../../model";
import { LANG_LABEL, type Lang } from "../../model/review-edit";
import { EditedMark } from "./parts";

type TextState = { origin: "AI" | "MANUAL"; stale: boolean } | undefined;

/** Пословная разница «было → стало»; null — показывать «было» и «стало» рядом (полная переписка описания — красно-зелёный шум). */
function diffOf(change: CardChange<string> | undefined, before: string, current: string, field: TextField): ReturnType<typeof wordDiff> {
  if (!change || !before) return null;
  const parts = wordDiff(before, current);
  if (!parts) return null;
  const same = parts.filter((p) => p.type === "same").reduce((n, p) => n + p.text.trim().length, 0);
  return same / Math.max(1, current.length) < 0.4 && field === "description" ? null : parts;
}

function TextBadges({ change, before, current, state, edited }: { change: CardChange<string> | undefined; before: string; current: string; state: TextState; edited: boolean }) {
  return (
    <>
      {change ? (
        <Badge tone="info">{before ? "изменено ИИ" : "добавлено ИИ"}</Badge>
      ) : current ? (
        <span className="text-[11.5px] text-[var(--text-faint)]">без изменений</span>
      ) : null}
      {change?.edited && <EditedMark />}
      {state?.origin === "MANUAL" && <Badge tone="neutral">ручной</Badge>}
      {state?.stale && (
        <span title="Перевод сделан для другого русского текста — на сайте покажется русский, пока его не обновят">
          <Badge tone="warn">устарел</Badge>
        </span>
      )}
      {edited && <Badge tone="accent">не сохранено</Badge>}
    </>
  );
}

function BeforeAfter({ before, current }: { before: string; current: string }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      <div>
        <div className="field-label mb-1 !text-[10.5px] !text-[var(--text-faint)]">Было</div>
        <div className="text-[var(--text-muted)] opacity-80">
          <SourceText text={before} />
        </div>
      </div>
      <div>
        <div className="field-label mb-1 !text-[10.5px] !text-[var(--text-faint)]">Стало</div>
        <SourceText text={current} />
      </div>
    </div>
  );
}

interface ViewProps {
  lang: Lang;
  current: string;
  before: string;
  change: CardChange<string> | undefined;
  diff: ReturnType<typeof wordDiff>;
  draft: string | undefined;
  edited: boolean;
}

/** Текст в режиме просмотра: правка, пусто, разница, было/стало или просто текст. */
function TextView({ lang, current, before, change, diff, draft, edited }: ViewProps) {
  if (edited) return <SourceText text={draft!} />;
  if (!current) return <div className="text-[13px] text-[var(--text-faint)]">{lang === "ru" ? "— пусто —" : "Нет перевода — на сайте покажется русский текст."}</div>;
  if (diff) return <Diff parts={diff} />;
  if (change && before) return <BeforeAfter before={before} current={current} />;
  return <SourceText text={current} />;
}

export function TextBlock({
  lang,
  field,
  current,
  change,
  state,
  draft,
  onDraft,
}: {
  lang: Lang;
  field: TextField;
  current: string;
  change: CardChange<string> | undefined;
  state: TextState;
  draft: string | undefined;
  onDraft: (v: string) => void;
}) {
  const [editing, setEditing] = useState(draft !== undefined);
  // The Russian condition note is the product's own (edited in the product), its uk/en are here.
  const editable = !(lang === "ru" && field === "conditionNote");
  const before = change?.before ?? "";
  const diff = useMemo(() => diffOf(change, before, current, field), [change, before, current, field]);
  const edited = draft !== undefined && draft.trim() !== current.trim();

  function toggleEditing() {
    if (!editing && draft === undefined) onDraft(current);
    setEditing(!editing);
  }

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--bg-2)] p-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[12.5px] font-semibold text-[var(--text)]">{TEXT_LABEL[field]}</span>
        <TextBadges change={change} before={before} current={current} state={state} edited={edited} />
        {editable && (
          <button
            type="button"
            onClick={toggleEditing}
            className="focusable hit ml-auto inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-faint)] transition-colors hover:text-[var(--accent-hi)]"
          >
            <PencilLine className="h-3.5 w-3.5" /> {editing ? "Готово" : "Править"}
          </button>
        )}
      </div>
      {editing ? (
        <InlineText ariaLabel={`${TEXT_LABEL[field]} ${LANG_LABEL[lang]}`} value={draft ?? current} onChange={onDraft} />
      ) : (
        <TextView lang={lang} current={current} before={before} change={change} diff={diff} draft={draft} edited={edited} />
      )}
    </div>
  );
}
