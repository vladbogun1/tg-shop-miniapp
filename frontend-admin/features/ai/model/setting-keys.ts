/**
 * Ключи настроек группы «ИИ» (контракт с бэкендом, `AiSettings`: не меняются) и разбивка по блокам панели в порядке
 * макета 07-settings: Состояние (общий выключатель), Лимиты, Функции, Поиск, Уведомления, Ещё → «Дополнительно».
 * Панель сама настройки не читает и не пишет: поля рисует и сохраняет экран «Настроек», сюда он передаёт только ключи.
 */
export const AI_GROUP = "ai";

export const AI_KEYS = {
  enabled: "ai.enabled",
  monthLimit: "ai.monthLimitCents",
  dayLimit: "ai.dayLimitCents",
} as const;

export const AI_BLOCKS = {
  state: [AI_KEYS.enabled],
  limits: [AI_KEYS.monthLimit, AI_KEYS.dayLimit, "ai.batchSize"],
  functions: ["ai.feature.card", "ai.feature.completion", "ai.feature.translation", "ai.feature.supply", "ai.feature.batch"],
  search: ["ai.serperPaid"],
  alerts: ["ai.alertsTo"],
  more: ["ai.jobCeilingFactor", "ai.deadlineMinutes", "ai.searchPace", "ai.retentionDays", "ai.usdRateKopecks"],
} as const;

export type AiBlock = keyof typeof AI_BLOCKS;

/** Ключи блока. */
export function blockKeys(block: AiBlock): readonly string[] {
  return AI_BLOCKS[block];
}

/** Всё, что бэкенд добавит в группу позже и чего нет в списке: панель покажет это в «Дополнительно». */
export function unlistedKeys(all: readonly string[]): string[] {
  const known = new Set<string>(Object.values(AI_BLOCKS).flat());
  return all.filter((k) => !known.has(k));
}
