"use client";

/**
 * Пакеты карточек на странице: полоса хода/итога (и законченного ручного пакета) с подробным итогом записи, лента
 * быстрой проверки, «Принять безопасное» и ручной путь для того, что ИИ не сделал («Оформить N вручную»). Ставится
 * один раз в оболочке админки, чтобы ход пакета был виден на любом экране. Нет пакетов — ничего не рисует.
 */
import { BatchPanel, QuickReviewFeed, useAiBatches, type AiBatch } from "@/features/ai";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCardItems, useCardSchema } from "../../../queries";
import { PhotoSummary } from "../../photos/PhotoSummary";
import { ManualFromBatch } from "../../manual/ManualBatchEntry";
import { ManualBatchLayer } from "../../manual/ManualBatchLayer";
import { CardBatchReport } from "./CardBatchReport";
import { CardFeedItem } from "./CardFeedItem";
import { FeedReplaceToggle } from "./FeedReplaceToggle";
import { SafeAcceptButton } from "./SafeAcceptButton";
import { useFeedAccept } from "./use-feed-accept";

export function CardBatchHost() {
  const router = useRouter();
  const items = useCardItems();
  const schema = useCardSchema();
  const batches = useAiBatches();
  const [feedId, setFeedId] = useState<number | null>(null);
  const feed = useFeedAccept({ batchId: feedId, schema: schema.data });
  // Строки берём из живого списка пакетов: принятая карточка уходит из ленты сама, отменённая — возвращается.
  const rows = (batches.data?.find((b) => b.id === feedId)?.jobs ?? []).filter((r) => r.status === "DONE" && !r.outcome);

  return (
    <>
      <BatchPanel
        onReview={(b) => setFeedId(b.id)}
        skipSummary={(b) => b.feature === "TRANSLATION"}
        manual={(b) => (b.feature === "COMPLETION" ? <ManualFromBatch batch={b} /> : null)}
        acceptSafe={(b) => <SafeAcceptButton batch={b} items={items.data} schema={schema.data} />}
        report={(b: AiBatch) => (b.feature === "COMPLETION" ? <CardBatchReport batch={b} /> : null)}
      />
      {/* Слой ручного пакета для «Оформить N вручную» на любой странице (рисует первый хозяин, см. manual-layer). */}
      <ManualBatchLayer />
      {feedId !== null && (
        <QuickReviewFeed
          open
          onClose={() => setFeedId(null)}
          rows={rows}
          item={(row) => <CardFeedItem row={row} replace={feed.replace} />}
          onAccept={feed.accept}
          toolbar={<FeedReplaceToggle replace={feed.replace} setReplace={feed.setReplace} />}
          status={<PhotoSummary photos={feed.photos} />}
          onEdit={(row) => {
            setFeedId(null);
            router.push(`/cards/ai-review/${row.id}`);
          }}
        />
      )}
    </>
  );
}
