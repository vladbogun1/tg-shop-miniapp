/**
 * Настройки react-query для всех приложений (docs/ARCHITECTURE-FRONT.md, 2.5 «Кэш и данные сервера»).
 * Чистый `@tanstack/query-core` — без React.
 *
 * Пресеты вместо литералов `staleTime`/`refetchInterval` в каждом запросе:
 *   live   — быстро меняется, опрос раз в 30 с (чат, статусы, бейджи);
 *   list   — списки и карточки, свежие 30 с;
 *   static — справочники и редко меняющееся (категории, словари), свежие 5 мин.
 */
import { QueryClient } from "@tanstack/query-core";

export interface QueryPreset {
  staleTime: number;
  refetchInterval?: number;
}

/** Свежесть данных в мс: значения, которые реально используются запросами (одно место вместо литералов). */
export const STALE_TIME = {
  quick: 15_000,
  list: 30_000,
  minute: 60_000,
  static: 5 * 60_000,
} as const;

/** Периоды опроса в мс: окно чата, бейдж, живое, медленное. */
export const POLL_INTERVAL = {
  chat: 15_000,
  badge: 20_000,
  live: 30_000,
  slow: 60_000,
} as const;

export const QUERY_PRESETS = {
  live: { staleTime: 0, refetchInterval: POLL_INTERVAL.live },
  list: { staleTime: STALE_TIME.list },
  static: { staleTime: STALE_TIME.static },
} as const satisfies Record<string, QueryPreset>;

/** Один клиент на приложение; приложение может задать свой `staleTime` по умолчанию (админка — 15 с). */
export function makeQueryClient(defaults: Partial<QueryPreset> = QUERY_PRESETS.list): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: defaults.staleTime ?? QUERY_PRESETS.list.staleTime,
        refetchOnWindowFocus: false,
      },
    },
  });
}
