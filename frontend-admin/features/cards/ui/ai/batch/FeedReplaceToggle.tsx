"use client";

/** «Заменить характеристики целиком» для ленты: по умолчанию выключено; включено — каждое «Принять» удаляет лишнее. */
export function FeedReplaceToggle({ replace, setReplace }: { replace: boolean; setReplace: (v: boolean) => void }) {
  return (
    <label className="flex min-w-0 items-start gap-2 rounded-[var(--r-md)] border border-[var(--line)] px-3 py-2 text-[13px]" data-testid="feed-replace">
      <input
        type="checkbox"
        checked={replace}
        onChange={(e) => setReplace(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
        data-testid="feed-replace-toggle"
      />
      <span className="min-w-0">
        Заменить характеристики целиком
        <span className={`block text-[12px] ${replace ? "text-[var(--danger-ink)]" : "text-[var(--text-faint)]"}`}>
          {replace
            ? "Включено: «Принять» удалит характеристики, которых нет в ответе (что именно — на карточке)"
            : "Выключено: «Принять» добавляет и меняет, но ничего не удаляет"}
        </span>
      </span>
    </label>
  );
}
