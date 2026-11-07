"use client";

import { Button } from "@shop/ui/admin-button";
import { Modal } from "@shop/ui/overlay";
import { useState, type ReactNode } from "react";
import type { AiBatchRow } from "../../api-batch";

/**
 * Лента быстрой проверки: по карточке за раз «Принять · Позже · Править». Что именно показать у карточки
 * (название, новые поля) и как её принять — решает вызывающий (`item`, `onAccept`), лента лишь ведёт по очереди.
 * «Позже» уводит карточку в конец этого просмотра; на сервере она остаётся ждать проверки. «Править» открывает
 * обычный экран проверки той же задачи.
 */
export function QuickReviewFeed(p: {
  open: boolean;
  onClose: () => void;
  rows: AiBatchRow[];
  item: (row: AiBatchRow) => ReactNode;
  onAccept: (row: AiBatchRow) => Promise<void>;
  onEdit: (row: AiBatchRow) => void;
}) {
  const [later, setLater] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const order = [...p.rows.filter((r) => !later.includes(r.id)), ...p.rows.filter((r) => later.includes(r.id))];
  const current = order[0];

  async function accept(row: AiBatchRow) {
    setBusy(true);
    try {
      await p.onAccept(row);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={p.open} onClose={p.onClose} size="md" title={`Быстрая проверка${order.length > 0 ? ` · осталось ${order.length}` : ""}`}>
      {!current ? (
        <p className="py-4 text-[13px] text-[var(--text-muted)]" data-testid="feed-empty">
          Всё проверено.
        </p>
      ) : (
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
      )}
    </Modal>
  );
}
