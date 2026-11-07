/**
 * Ключи настроек группы «ИИ» (контракт с бэкендом, `AiSettings`: не меняются) и разбивка по блокам панели.
 * Панель сама настройки не читает и не пишет: поля рисует и сохраняет экран «Настроек», сюда он передаёт только ключи.
 */
export const AI_GROUP = "ai";

export const AI_BLOCKS = {
  functions: ["ai.enabled", "ai.feature.card", "ai.feature.completion", "ai.feature.translation", "ai.feature.supply"],
  limits: [
    "ai.monthLimitCents",
    "ai.dayLimitCents",
    "ai.batchSize",
    "ai.usdRateKopecks",
    "ai.jobCeilingFactor",
    "ai.deadlineMinutes",
    "ai.retentionDays",
  ],
  search: ["ai.serperPaid"],
  alerts: ["ai.alertsTo"],
} as const;

export type AiBlock = keyof typeof AI_BLOCKS;

/** Ключи блока; всё, что бэкенд добавит в группу позже и чего нет в списке, панель покажет в конце «Лимитов». */
export function blockKeys(block: AiBlock): readonly string[] {
  return AI_BLOCKS[block];
}

export function unlistedKeys(all: readonly string[]): string[] {
  const known = new Set<string>(Object.values(AI_BLOCKS).flat());
  return all.filter((k) => !known.has(k));
}
