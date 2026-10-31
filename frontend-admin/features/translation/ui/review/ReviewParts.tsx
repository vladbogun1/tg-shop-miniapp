"use client";

/** Просмотр по одному: шапка с прогрессом, карточки «очередь пройдена» / «текста больше нет», панель действий, контекст. */
import { ArrowLeft, Check, ChevronLeft, ChevronRight, PartyPopper, SkipForward } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@shop/ui/admin-button";
import { placeOf } from "../../model/queue";
import { plural } from "../../model/plural";
import type { UniqueString } from "../../model/workset";
import { Kbd, KindBadge, ProductLink } from "../shared";

export function ReviewHeader({
  title,
  index,
  total,
  finished,
  busy,
  onLeave,
  onGo,
}: {
  title: string;
  index: number;
  total: number;
  finished: boolean;
  busy: boolean;
  onLeave: () => void;
  onGo: (i: number) => void;
}) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onLeave}>
          К списку
        </Button>
        <div className="font-display text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {title} · <span className="tabular text-[var(--text)]">{Math.min(index + 1, total)}</span> из <span className="tabular">{total}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label="Предыдущий" icon={<ChevronLeft className="h-4 w-4" />} disabled={index === 0 || busy} onClick={() => onGo(index - 1)} />
          <Button variant="outline" size="sm" aria-label="Следующий" icon={<ChevronRight className="h-4 w-4" />} disabled={index >= total - 1 || busy} onClick={() => onGo(index + 1)} />
        </div>
      </div>
      <div className="mb-4 h-1 overflow-hidden rounded-full bg-[var(--surface-3)]" aria-hidden>
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${((finished ? total : index) / Math.max(1, total)) * 100}%` }} />
      </div>
    </>
  );
}

export function FinishedCard({ total, title, onClose, onRestart }: { total: number; title: string; onClose: () => void; onRestart: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <PartyPopper className="h-9 w-9 text-[var(--accent-hi)]" />
      <div className="section-title !text-[16px] text-[var(--ink)]">Очередь пройдена</div>
      <p className="max-w-md text-[13px] text-[var(--text-muted)]">
        Просмотрено {total} {plural(total, "текст", "текста", "текстов")} из «{title}». Пропущенные остались в своих вкладках.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="accent" onClick={onClose}>
          К списку
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          Пройти ещё раз
        </Button>
      </div>
    </div>
  );
}

export function GoneCard({ onNext }: { onNext: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="section-title text-[var(--ink)]">Этого текста больше нет</div>
      <p className="max-w-md text-[13px] text-[var(--text-muted)]">
        Оригинал изменили или товар скрыли, пока открыт просмотр. Новый вариант текста — в списке.
      </p>
      <Button variant="outline" icon={<SkipForward className="h-4 w-4" />} onClick={onNext}>
        Дальше
      </Button>
    </div>
  );
}

export function ReviewActions({
  label,
  busy,
  isLast,
  onAccept,
  onSkip,
}: {
  label: string;
  busy: boolean;
  isLast: boolean;
  onAccept: () => void;
  onSkip: () => void;
}) {
  return (
    <div
      style={{ bottom: "var(--bottom-nav)" }}
      className="sticky z-10 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--r-lg)] sm:border sm:px-4 lg:bottom-3"
    >
      <Button variant="accent" chamfer icon={<Check className="h-4 w-4" />} loading={busy} onClick={onAccept}>
        {label}
      </Button>
      <Button variant="outline" icon={<SkipForward className="h-4 w-4" />} disabled={busy} onClick={onSkip} className={isLast ? "hidden" : undefined}>
        Пропустить
      </Button>
      <div className="ml-auto hidden items-center gap-3 text-[11.5px] text-[var(--text-faint)] md:flex">
        <span className="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> принять
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Alt</Kbd>+<Kbd>↑</Kbd>/<Kbd>↓</Kbd> листать
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> к списку
        </span>
      </div>
    </div>
  );
}

/** Kind of text + where it is used (products open in the editor in a new tab). */
export function Context({ s }: { s: UniqueString }) {
  const places = useMemo(() => {
    const seen = new Map<string, { productId: string | null; label: string; title: string | null }>();
    for (const f of s.fields) {
      const key = f.productId ?? `${f.entityType}:${f.entityId}`;
      if (!seen.has(key)) seen.set(key, { productId: f.productId, label: placeOf(f), title: f.productTitle });
    }
    return Array.from(seen.values());
  }, [s]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <KindBadge kindKey={s.kindKey} />
      {places.slice(0, 4).map((p, i) =>
        p.productId ? (
          <ProductLink key={i} productId={p.productId} title={p.title} />
        ) : (
          <span key={i} className="text-[12px] font-semibold text-[var(--text-muted)]">
            {p.label}
          </span>
        )
      )}
      {places.length > 4 && <span className="text-[12px] text-[var(--text-faint)]">и ещё {places.length - 4}</span>}
      {s.fields.length > 1 && (
        <span className="text-[12px] text-[var(--text-faint)]">
          · текст используется в {s.fields.length} {plural(s.fields.length, "месте", "местах", "местах")} — перевод сохранится везде
        </span>
      )}
    </div>
  );
}
