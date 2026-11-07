"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { useState, type ReactNode } from "react";

/** Строка ленты: задача пакета ИИ или товар ручного пакета — ленте нужен только устойчивый id. */
export interface FeedRow {
  id: number | string;
}

export interface QuickReviewDeckProps<R extends FeedRow> {
  rows: R[];
  item: (row: R) => ReactNode;
  onAccept: (row: R) => Promise<void>;
  onEdit: (row: R) => void;
  /** Что показать, когда проверять больше нечего. */
  empty?: ReactNode;
}

/**
 * Лента быстрой проверки: по карточке за раз «Принять · Позже · Править». Что именно показать у карточки
 * (название, новые поля) и как её принять — решает вызывающий (`item`, `onAccept`), лента лишь ведёт по очереди.
 * «Позже» уводит карточку в конец этого просмотра; на сервере она остаётся ждать проверки. «Править» открывает
 * обычный экран проверки той же карточки. Без окна: ручной пакет показывает ленту прямо в своём слое.
 */
export function QuickReviewDeck<R extends FeedRow>(p: QuickReviewDeckProps<R>) {
  const [later, setLater] = useState<R["id"][]>([]);
  const [busy, setBusy] = useState(false);
  const order = [...p.rows.filter((r) => !later.includes(r.id)), ...p.rows.filter((r) => later.includes(r.id))];
  const current = order[0];

  async function accept(row: R) {
    setBusy(true);
    try {
      await p.onAccept(row);
    } finally {
      setBusy(false);
    }
  }

  if (!current) {
    return (
      <div className="py-4 text-[13px] text-[var(--text-muted)]" data-testid="feed-empty">
        {p.empty ?? "Всё проверено."}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="feed-card">
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
