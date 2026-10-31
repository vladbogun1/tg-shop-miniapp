"use client";

/**
 * Состояние «Перевода через ИИ»: промпт по частям (заморожен при открытии) → ответ → проверка строк → сохранение.
 * Запись — `useSendAiTranslations`; здесь только подтверждение и обновление списка строк после ответа.
 */
import { useConfirm } from "@shop/ui/confirm";
import { useMemo, useState } from "react";
import { buildReview, revalidate, type ReviewRow } from "../../model/review";
import { parseAnswer } from "../../model/parse";
import { buildPrompt, KIND_LABEL, splitIntoParts, type PromptString } from "../../model/prompt";
import { plural } from "../../model/plural";
import { staleManual } from "../../model/queue";
import { failedFixIds, planSend, type SendSummary } from "../../model/send";
import { LOCALES, type WorkSet } from "../../model/workset";
import { useSendAiTranslations } from "../../queries";

export type ReviewFilter = "all" | "ok" | "warn" | "error" | "ru";

/** The row would overwrite an outdated translation the admin wrote by hand. */
export function replacesManual(r: ReviewRow): boolean {
  return LOCALES.some((l) => staleManual(r.str, l).length > 0);
}

function toggled(set: Set<string>, id: string, on: boolean): Set<string> {
  const n = new Set(set);
  if (on) n.add(id);
  else n.delete(id);
  return n;
}

/** Части промпта: выбранные тексты списка, разбитые по размеру. */
function usePromptParts(ws: WorkSet, scope: string[]) {
  const [frozen] = useState(() => {
    const wanted = new Set(scope);
    const chosen = ws.strings.filter((s) => wanted.has(s.sourceHash));
    const strings: (PromptString & { ru: string })[] = chosen.map((s) => ({
      id: s.id,
      kind: KIND_LABEL[s.kindKey] ?? s.kindKey,
      product: s.product,
      ru: s.source,
    }));
    const split = splitIntoParts(strings);
    return {
      chosen,
      parts: split.map((p, i) => ({
        ids: p.map((x) => x.id),
        text: buildPrompt(p, i + 1, split.length),
        chars: p.reduce((n, x) => n + x.ru.length, 0),
      })),
    };
  });
  return frozen;
}

export function useAiSession(ws: WorkSet, scope: string[], onClose: () => void) {
  const confirm = useConfirm();
  const { chosen, parts } = usePromptParts(ws, scope);
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<number | null>(null);
  const fieldCount = chosen.reduce((n, s) => n + s.fields.length, 0);

  const [answer, setAnswer] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<{ id: string; problems: string[] }[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyFix, setApplyFix] = useState<Set<string>>(new Set());
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [summary, setSummary] = useState<SendSummary | null>(null);

  function check(text = answer) {
    const parsed = parseAnswer(text);
    setParseErrors(parsed.errors);
    setNotes(parsed.notes);
    if (!text.trim() || parsed.entries.size === 0) {
      setRows(null);
      setUnknown([]);
      setInvalid([]);
      setMissing([]);
      return;
    }
    const r = buildReview(parsed, ws);
    setUnknown(r.unknown);
    setInvalid(r.invalid);
    // Missing = ids of every part the answer touched that are not in it.
    const answered = new Set(parsed.entries.keys());
    const miss: string[] = [];
    for (const p of parts) {
      if (p.ids.some((id) => answered.has(id))) miss.push(...p.ids.filter((id) => !answered.has(id)));
    }
    setMissing(miss);
    setRows(r.rows);
    // Clean rows are pre-ticked; a row that would replace the admin's own translation never is.
    setSelected(new Set(r.rows.filter((x) => x.level === "ok" && !x.done && !replacesManual(x)).map((x) => x.id)));
    setApplyFix(new Set());
    setSummary(null);
  }

  function clearAnswer() {
    setAnswer("");
    setRows(null);
    setParseErrors([]);
    setNotes([]);
    setSummary(null);
  }

  const stats = useMemo(() => {
    const r = rows ?? [];
    return {
      ok: r.filter((x) => x.level === "ok").length,
      warn: r.filter((x) => x.level === "warn").length,
      error: r.filter((x) => x.level === "error").length,
      ru: r.filter((x) => x.ruChanged).length,
    };
  }, [rows]);
  const visibleRows = useMemo(
    () => (rows ?? []).filter((r) => (reviewFilter === "all" ? true : reviewFilter === "ru" ? r.ruChanged : r.level === reviewFilter)),
    [rows, reviewFilter]
  );
  const sendable = (rows ?? []).filter((r) => selected.has(r.id) && r.level !== "error" && !r.done);

  function edit(id: string, patch: Partial<Pick<ReviewRow, "uk" | "en">>) {
    setRows((prev) => (prev ?? []).map((r) => (r.id === id ? revalidate({ ...r, ...patch }) : r)));
  }

  const sendM = useSendAiTranslations((result) => {
    setSummary(result);
    // Sent rows leave the review; what failed stays for another try.
    if (result.importErrors.length) return;
    const failed = failedFixIds(result);
    const sentIds = new Set(sendable.filter((r) => !failed.has(r.id)).map((r) => r.id));
    setRows((prev) => (prev ?? []).filter((r) => !sentIds.has(r.id)));
    setSelected(new Set());
    setApplyFix(new Set());
  });

  async function send() {
    if (!rows || sendM.isPending) return;
    const { plan, fieldsTotal, manualTotal } = planSend(sendable, applyFix);
    const nRows = sendable.length;
    const nFix = plan.fixRows.length;
    const ok = await confirm({
      title: `Сохранить переводы ${nRows} ${plural(nRows, "текста", "текстов", "текстов")}?`,
      message: (
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {fieldsTotal > 0 && (
            <li>
              {fieldsTotal} {plural(fieldsTotal, "перевод", "перевода", "переводов")} (места × языки) сразу увидят покупатели.
            </li>
          )}
          {manualTotal > 0 && (
            <li className="text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">{manualTotal} из них заменят ваши устаревшие ручные переводы.</li>
          )}
          {nFix > 0 && (
            <li className="text-[var(--accent-hi)]">
              Русский оригинал будет исправлен в {nFix} {plural(nFix, "тексте", "текстах", "текстах")}.
            </li>
          )}
          <li>Всё сохранённое попадёт во вкладку «Проверить ИИ» — там его можно просмотреть и принять.</li>
        </ul>
      ),
      confirmLabel: "Сохранить",
    });
    if (ok) sendM.mutate(plan);
  }

  const unsent = (rows ?? []).length > 0 || (!rows && answer.trim().length > 0);
  async function leave() {
    if (
      unsent &&
      !(await confirm({
        title: "Закрыть перевод через ИИ?",
        message: "Вставленный ответ и неотправленные переводы пропадут.",
        confirmLabel: "Закрыть",
        danger: true,
      }))
    ) {
      return;
    }
    onClose();
  }

  const select = (pick: (r: ReviewRow) => boolean) => setSelected(new Set((rows ?? []).filter(pick).map((r) => r.id)));

  return {
    // шаг 1
    chosen,
    parts,
    fieldCount,
    copied,
    markCopied: (i: number) => setCopied(new Set(copied).add(i)),
    nextPart: parts.findIndex((_, i) => !copied.has(i)),
    preview,
    togglePreview: (i: number) => setPreview(preview === i ? null : i),
    // шаг 2
    answer,
    setAnswer,
    check,
    clearAnswer,
    problems: { parseErrors, notes, unknown, invalid, missing },
    // шаг 3
    rows,
    stats,
    visibleRows,
    reviewFilter,
    setReviewFilter,
    selected,
    applyFix,
    sendable,
    summary,
    sending: sendM.isPending,
    edit,
    select,
    clearSelected: () => setSelected(new Set()),
    toggleSelected: (id: string, on: boolean) => setSelected(toggled(selected, id, on)),
    toggleFix: (id: string, on: boolean) => setApplyFix(toggled(applyFix, id, on)),
    send,
    leave,
  };
}

export type AiSession = ReturnType<typeof useAiSession>;
