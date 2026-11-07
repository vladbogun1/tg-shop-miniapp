"use client";

import { errorMessage } from "@shop/core/errors";
import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { toast } from "@shop/ui/toast";
import { useState, type ReactNode } from "react";

/** Строка ленты: задача пакета ИИ или товар ручного пакета — ленте нужен только устойчивый id. */
export interface FeedRow {
  id: number | string;
}

/** Что принято последним: подпись для полосы «Принято … · Отменить» и сама отмена (строка вернётся в ленту). */
export interface FeedAccepted {
  label: string;
  undo: () => Promise<void>;
}

export interface QuickReviewDeckProps<R extends FeedRow> {
  rows: R[];
  item: (row: R) => ReactNode;
  /** Принять строку; вернуть `FeedAccepted`, если принятое можно отменить из ленты. */
  onAccept: (row: R) => Promise<FeedAccepted | void>;
  onEdit: (row: R) => void;
  /** Что показать, когда проверять больше нечего. */
  empty?: ReactNode;
  /** Над карточкой: общие для всей ленты переключатели (их знает предмет ленты). */
  toolbar?: ReactNode;
  /** Под кнопками: ход фоновой работы после приёма (загрузка фото). */
  status?: ReactNode;
}

function UndoStrip({ last, onDone }: { last: FeedAccepted; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function undo() {
    setBusy(true);
    try {
      await last.undo();
      onDone();
    } catch (e) {
      toast.error(errorMessage(e, undefined, "Не удалось отменить"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--r-md)] bg-[var(--surface-2)] px-3 py-2 text-[13px]" data-testid="feed-undo-strip">
      <span className="min-w-0 break-words text-[var(--text-muted)]">
        Принято: <span className="font-medium text-[var(--text)]">{last.label}</span>
      </span>
      <Button size="sm" variant="ghost" className="ml-auto" loading={busy} onClick={() => void undo()} data-testid="feed-undo">
        Отменить
      </Button>
    </div>
  );
}

/**
 * Лента быстрой проверки: по карточке за раз «Принять · Позже · Править». Что именно показать у карточки
 * (название, новые поля) и как её принять — решает вызывающий (`item`, `onAccept`), лента лишь ведёт по очереди.
 * «Позже» уводит карточку в конец этого просмотра; на сервере она остаётся ждать проверки. «Править» открывает
 * обычный экран проверки той же карточки. После «Принять» — полоса «Принято … · Отменить»: отмена возвращает
 * значения карточки, и строка снова появляется в ленте. Без окна: ручной пакет показывает ленту прямо в своём слое.
 */
export function QuickReviewDeck<R extends FeedRow>(p: QuickReviewDeckProps<R>) {
  const [later, setLater] = useState<R["id"][]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<FeedAccepted | null>(null);
  const order = [...p.rows.filter((r) => !later.includes(r.id)), ...p.rows.filter((r) => later.includes(r.id))];
  const current = order[0];

  async function accept(row: R) {
    setBusy(true);
    try {
      setLast((await p.onAccept(row)) ?? null);
    } catch (e) {
      // Карточка остаётся в ленте: её можно принять ещё раз или открыть «Править».
      toast.error(errorMessage(e, undefined, "Не удалось принять карточку"));
    } finally {
      setBusy(false);
    }
  }

  const strip = last && <UndoStrip last={last} onDone={() => setLast(null)} />;
  if (!current) {
    return (
      <div className="flex flex-col gap-3">
        {strip}
        <div className="py-4 text-[13px] text-[var(--text-muted)]" data-testid="feed-empty">
          {p.empty ?? "Всё проверено."}
        </div>
        {p.status}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="feed-card">
      {p.toolbar}
      {strip}
      {p.item(current)}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy || order.length < 2} onClick={() => setLater([...later.filter((x) => x !== current.id), current.id])} data-testid="feed-later">
          Позже
        </Button>
        <Button variant="surface" disabled={busy} onClick={() => p.onEdit(current)} data-testid="feed-edit">
          Править
        </Button>
        <Button variant="accent" loading={busy} onClick={() => void accept(current)} data-testid="feed-accept">
          Принять
        </Button>
      </div>
      {p.status}
    </div>
  );
}

/** Та же лента в окне — для готового пакета ИИ поверх любой страницы. */
export function QuickReviewFeed<R extends FeedRow>(p: QuickReviewDeckProps<R> & { open: boolean; onClose: () => void }) {
  const { open, onClose, ...deck } = p;
  return (
    <Modal open={open} onClose={onClose} size="md" title={`Быстрая проверка${p.rows.length > 0 ? ` · осталось ${p.rows.length}` : ""}`}>
      <QuickReviewDeck {...deck} />
    </Modal>
  );
}
