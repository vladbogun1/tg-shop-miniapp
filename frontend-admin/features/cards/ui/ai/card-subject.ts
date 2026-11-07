"use client";

/**
 * Товар и схема для встроенного ИИ: свежая выгрузка одного товара (версия карточки считается по ней) и запуск задачи.
 * Снимок значений на старте делает сервер при постановке задачи — конфликт правок виден с любого устройства.
 */
import { aiApi, type AiJob } from "@/features/ai";
import { QUERY_PRESETS } from "@shop/core/query";
import { useQuery } from "@tanstack/react-query";
import { cardsApi } from "../../api";
import { cardsKeys } from "../../keys";
import { CARD_PROMPT_VERSION, cardVersion } from "../../model/ai-card";
import { assignCardIds, type CardItem } from "../../model/item";
import { buildCardPrompt } from "../../model/prompt";
import type { CardSchema } from "../../model/schema";
import { useCardSchema } from "../../queries";

/** Товар свежим запросом при каждом открытии: отпечаток по устаревшему кэшу дал бы ложный конфликт. */
export function useCardSubject(productId: string, enabled = true) {
  const schemaQ = useCardSchema();
  const itemQ = useQuery({
    queryKey: cardsKeys.exportOne(productId),
    queryFn: async () => (await cardsApi.export("all", [productId])).find((i) => i.id === productId) ?? null,
    enabled: enabled && !!productId,
    staleTime: QUERY_PRESETS.live.staleTime,
    refetchOnMount: "always",
  });
  return { item: itemQ.data ?? null, schema: schemaQ.data, loading: itemQ.isLoading || schemaQ.isLoading, failed: itemQ.isError || schemaQ.isError };
}

/** Запуск карточной задачи: промпт и отпечаток собирает фронт, сервер лишь ставит задачу в очередь. */
export async function startCardJob(args: { item: CardItem; schema: CardSchema; created: boolean; idemKey: string }): Promise<AiJob> {
  const { item, schema, created, idemKey } = args;
  const prompt = buildCardPrompt([item], schema, { part: 1, total: 1, ids: assignCardIds([item.id]) });
  return aiApi.startCard(
    { productId: item.id, created, subjectVersion: cardVersion(item), prompt, promptVersion: CARD_PROMPT_VERSION },
    idemKey,
  );
}
