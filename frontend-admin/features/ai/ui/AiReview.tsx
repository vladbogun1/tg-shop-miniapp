"use client";

/**
 * Экран проверки результата ИИ (полноэкранная страница, на телефоне без нижней навигации; `embedded` — внутри окна
 * ручного пути через ChatGPT): группы полей, «Выбрано N из M» и «Применить (N)» — одно и то же число из `counts()`.
 * Сам экран ничего не знает про товар: поля, правка значения, применение и пункты «⋯» приходят от фичи-владельца.
 */
import { ArrowLeft, Check } from "lucide-react";
import type { ReactNode } from "react";
import { nowMs } from "@shop/core/time";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { buildGroups, counts, initialSelection, isStale, selectedByGroup, toggled, applicable, type ReviewField } from "../model/review-model";
import { ReviewGroup } from "./review/ReviewGroup";
import { ReviewMenu, type MenuItem } from "./review/ReviewMenu";

export interface AiReviewProps {
  /** Когда ИИ закончил (для «результат устарел»); у ручного пути — нет. */
  finishedAt?: string | null;
  title: string;
  fields: ReviewField[];
  selected: ReadonlySet<string>;
  onSelected: (next: Set<string>) => void;
  onApply: () => void;
  applying: boolean;
  /** Результат уже применён или отклонён: кнопки заменяет итог. */
  doneText?: string | null;
  menu: MenuItem[];
  onBack: () => void;
  /** Плашки сверху: «карточку изменили», «ИИ не нашёл…». */
  notices?: ReactNode;
  /** Под группами: «Выложить на витрину» и т.п. */
  extra?: ReactNode;
  /** Подпись на кнопке под «Применить (N)», когда включено 0. */
  emptyHint?: string;
  /** Правка значения строки: текст ошибки или null; нет — значения не правят. */
  onEdit?: (key: string, value: string) => string | null;
  /** Что ещё применится помимо полей («2 фото»): дописывается на кнопку и разрешает её при 0 полей. */
  applyNote?: string | null;
  /** Внутри модального окна: подвал прилипает к низу окна, а не страницы. */
  embedded?: boolean;
}

export function AiReview(p: AiReviewProps) {
  const { fields, selected } = p;
  const c = counts(fields, selected);
  const byGroup = selectedByGroup(fields, selected);
  const groups = buildGroups(fields);
  const stale = isStale(p.finishedAt, nowMs());
  const toggle = (f: ReviewField) => p.onSelected(toggled(selected, f));
  const setGroup = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) (on ? next.add(id) : next.delete(id));
    p.onSelected(next);
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={p.onBack} aria-label="Назад" className="nb-press grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text-muted)]">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[16px] font-bold text-[var(--ink)]">{p.title}</h1>
          <div className="text-[12.5px] text-[var(--text-muted)]" aria-live="polite">Выбрано {c.n} из {c.m}</div>
        </div>
      </div>
      {stale && <Notice tone="warn">Результат старше двух недель и мог устареть: цены и характеристики на рынке меняются. Проверьте внимательнее или повторите.</Notice>}
      {p.notices}
      {fields.length === 0 && <Notice tone="info">ИИ не предложил ни одного изменения.</Notice>}
      {groups.map((g) => (
        <ReviewGroup
          key={g.id}
          id={g.id}
          fields={g.fields}
          selected={selected}
          chosenHere={byGroup[g.id]}
          onToggle={toggle}
          onAll={(on) => setGroup(g.fields.filter(applicable).map((f) => f.key), on)}
          onEdit={p.onEdit && ((f, v) => p.onEdit!(f.key, v))}
        />
      ))}
      {p.extra}
      <div
        className={cn(
          "sticky bottom-0 z-20 -mx-4 border-t border-[var(--line)] bg-[rgba(14,14,16,.94)] px-4 pb-[calc(12px+var(--safe-bottom))] pt-3 backdrop-blur-md",
          p.embedded ? "-mb-4 sm:-mx-5 sm:px-5 sm:pb-3" : "lg:-mx-7 lg:px-7",
        )}
      >
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          {p.doneText ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold text-[var(--ok)]">
              <Check className="h-4 w-4 shrink-0" />
              <span className="truncate">{p.doneText}</span>
            </div>
          ) : (
            <Button variant="accent" size="lg" className="min-w-0 flex-1" onClick={p.onApply} loading={p.applying} disabled={(c.n === 0 && !p.applyNote) || p.applying}>
              Применить ({c.n}){p.applyNote ? ` + ${p.applyNote}` : ""}
            </Button>
          )}
          <ReviewMenu items={p.menu} />
        </div>
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "warn" | "info" | "bad"; children: ReactNode }) {
  const color = tone === "bad" ? "var(--danger-ink)" : tone === "warn" ? "var(--warn)" : "var(--text-muted)";
  return (
    <div role="status" className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] leading-snug" style={{ color }}>
      {children}
    </div>
  );
}

export { initialSelection };
