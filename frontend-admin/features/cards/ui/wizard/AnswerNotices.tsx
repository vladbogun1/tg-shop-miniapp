"use client";

import type { AnswerReview } from "./use-answer-review";

/** Всё, что не так с ответом: ошибки разбора, неизвестные id, исключённые записи, пропавшие товары, автоисправления. */
export function AnswerNotices({ a }: { a: AnswerReview }) {
  const { parseErrors, notes, unknown, invalid, missing } = a;
  if (!(parseErrors.length > 0 || notes.length > 0 || unknown.length > 0 || invalid.length > 0 || missing.length > 0)) return null;
  return (
    <div className="mt-3 flex flex-col gap-1.5 text-[13px] font-semibold">
      {parseErrors.map((e, i) => (
        <div key={i} className="text-[var(--danger-ink)]">✕ {e}</div>
      ))}
      {unknown.length > 0 && (
        <div className="text-[var(--danger-ink)]">
          ✕ Неизвестные id ({unknown.length}) — исключены (ИИ исказил id или товара больше нет):{" "}
          <span className="font-mono">{unknown.slice(0, 12).join(", ")}{unknown.length > 12 ? "…" : ""}</span>
        </div>
      )}
      {invalid.map((x) => (
        <div key={x.id} className="text-[var(--danger-ink)]">
          ✕ <span className="font-mono">{x.id}</span>: {x.problems.join("; ")} — исключено
        </div>
      ))}
      {missing.length > 0 && (
        <div className="text-[color-mix(in_srgb,var(--warn)_80%,var(--text))]">
          ! Нет в ответе {missing.length} товаров из отправленных пакетов — попросите ИИ продолжить или скопируйте пакет ещё раз:{" "}
          <span className="font-mono">{missing.slice(0, 12).join(", ")}{missing.length > 12 ? "…" : ""}</span>
        </div>
      )}
      {notes.map((n, i) => (
        <div key={i} className="text-[var(--text-muted)]">ℹ Исправлено автоматически: {n}</div>
      ))}
    </div>
  );
}
