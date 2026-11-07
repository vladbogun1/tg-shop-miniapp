"use client";

/**
 * Пакеты карточек на странице: полоса хода/итога (и законченного ручного пакета), лента быстрой проверки,
 * «Принять безопасное» и ручной путь для того, что ИИ не сделал («Оформить N вручную»). Ставится один раз
 * в оболочке админки, чтобы ход пакета был виден на любом экране. Нет пакетов — ничего не рисует.
 */
import { BatchPanel, invalidateAfterBatch, QuickReviewFeed, useAiBatches, type AiBatchRow } from "@/features/ai";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { invalidateCards, useCardItems, useCardSchema } from "../../../queries";
import { acceptRow } from "./card-batch-apply";
import { ManualFromBatch } from "../../manual/ManualBatchEntry";
import { ManualBatchLayer } from "../../manual/ManualBatchLayer";
import { CardFeedItem } from "./CardFeedItem";
import { SafeAcceptButton } from "./SafeAcceptButton";

export function CardBatchHost() {
  const qc = useQueryClient();
  const router = useRouter();
  const items = useCardItems();
  const schema = useCardSchema();
  const batches = useAiBatches();
  const [feedId, setFeedId] = useState<number | null>(null);
  // Строки берём из живого списка пакетов: принятая карточка уходит из ленты сама.
  const rows = (batches.data?.find((b) => b.id === feedId)?.jobs ?? []).filter((r) => r.status === "DONE" && !r.outcome);

  async function accept(row: AiBatchRow): Promise<void> {
    await acceptRow(row, schema.data);
    invalidateCards(qc);
    invalidateAfterBatch.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
  }

  return (
    <>
      <BatchPanel
        onReview={(b) => setFeedId(b.id)}
        skipSummary={(b) => b.feature === "TRANSLATION"}
        manual={(b) => (b.feature === "COMPLETION" ? <ManualFromBatch batch={b} /> : null)}
        acceptSafe={(b) => <SafeAcceptButton batch={b} items={items.data} schema={schema.data} />} />
      {/* Слой ручного пакета для «Оформить N вручную» на любой странице (рисует первый хозяин, см. manual-layer). */}
      <ManualBatchLayer />
      {feedId !== null && (
        <QuickReviewFeed
          open
          onClose={() => setFeedId(null)}
          rows={rows}
          item={(row) => <CardFeedItem row={row} />}
          onAccept={accept}
          onEdit={(row) => {
            setFeedId(null);
            router.push(`/cards/ai-review/${row.id}`);
          }}
        />
      )}
    </>
  );
}
