"use client";

import { QuickReviewDeck } from "@/features/ai";
import { Button } from "@shop/ui/admin-button";
import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { initialKeys, reviewRows } from "../../model/ai-card";
import type { ProductReview } from "../../model/types";
import { FeedCard } from "../ai/batch/CardFeedItem";
import { CardReviewPanel } from "../ai/CardReviewPanel";
import type { ManualBatch } from "./use-manual-batch";

interface Row {
  id: string;
  review: ProductReview;
}

/** «Править» в ручном пакете: обычный экран проверки карточки внутри слоя; после записи — назад в ленту. */
function EditCard({ m, review, onBack }: { m: ManualBatch; review: ProductReview; onBack: () => void }) {
  const item = review.item;
  const ctx = useMemo(() => m.ctxOf(item), [m, item]);
  return (
    <CardReviewPanel
      embedded
      item={item}
      review={review}
      ctx={ctx}
      created={item.unfinished === true}
      title={item.title}
      onBack={onBack}
      menu={() => []}
      onApplied={() => m.finishCard(item.id)}
      onClose={onBack}
    />
  );
}

function Finished({ m, onClose }: { m: ManualBatch; onClose: () => void }) {
  const left = m.unanswered.length;
  return (
    <div className="flex flex-col gap-3" data-testid="manual-finished">
      <p className="text-[14px] text-[var(--text)]">
        Всё проверено. Принято из этого пакета: {m.draft?.done.length ?? 0}.
        {left > 0 && ` Без ответа осталось ${left} — их можно дописать в частях.`}
      </p>
      <div className="flex flex-wrap gap-2">
        {left > 0 && (
          <Button variant="surface" onClick={() => m.goPart(m.draft?.part ?? 0)}>
            К частям
          </Button>
        )}
        <Button
          variant="accent"
          onClick={() => {
            m.finish();
            onClose();
          }}
          data-testid="manual-finish"
        >
          Закончить
        </Button>
      </div>
    </div>
  );
}

/** Проверка ручного пакета: та же лента «Принять · Позже · Править», что у пакета ИИ, но по разобранным ответам. */
export function ManualReviewStage({ m, onClose }: { m: ManualBatch; onClose: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const rows: Row[] = m.pending.map((review) => ({ id: review.item.id, review }));
  const edited = editing ? rows.find((r) => r.id === editing) : undefined;
  const total = m.draft?.ids.length ?? 0;

  if (edited) return <EditCard m={m} review={edited.review} onBack={() => setEditing(null)} />;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-bold text-[var(--ink)]">Вручную: проверка</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]" data-testid="manual-review-sub">
            Ответов {total - m.unanswered.length} из {total} · принято {m.draft?.done.length ?? 0} · осталось {rows.length}
          </p>
        </div>
        <Button variant="surface" size="sm" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => m.goPart(m.draft?.part ?? 0)}>
          К частям
        </Button>
      </div>
      <section className="card p-4 sm:p-5">
        <QuickReviewDeck<Row>
          rows={rows}
          item={(row) => {
            const r = reviewRows(row.review, m.ctxOf(row.review.item));
            return <FeedCard title={row.review.item.title} rows={r} initial={initialKeys(row.review, r, row.review.item.unfinished === true)} problem={row.review.issues.find((i) => i.level === "error")?.text} />;
          }}
          onAccept={(row) => m.accept(row.review)}
          onEdit={(row) => setEditing(row.id)}
          empty={<Finished m={m} onClose={onClose} />}
        />
      </section>
    </div>
  );
}
