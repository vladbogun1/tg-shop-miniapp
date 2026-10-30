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

export const QUERY_PRESETS = {
  live: { staleTime: 0, refetchInterval: 30_000 },
  list: { staleTime: 30_000 },
  static: { staleTime: 5 * 60_000 },
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
