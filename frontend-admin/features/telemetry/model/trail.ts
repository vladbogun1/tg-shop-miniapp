/**
 * «Хлебные крошки»: последние шаги перед проблемой (смена экрана, приложение скрыто/показано, возврат из bfcache).
 * Сами по себе не отправляются — прикладываются к ошибке/зависанию/тапу как `meta.trail`.
 */
export interface Crumb {
  at: number;
  kind: string;
  value?: string;
}

export interface Trail {
  push(kind: string, value: string | undefined, atMs: number): void;
  /** `["-12.4s route /orders", "-3s hide", "-0.2s show"]` — от старых к новым. */
  snapshot(nowMs: number): string[];
}

export const TRAIL_MAX = 15;
/** Секунды с одним знаком после запятой. */
const MS_PER_TENTH = 100;
const TENTHS_PER_SECOND = 10;

export function createTrail(max = TRAIL_MAX): Trail {
  const crumbs: Crumb[] = [];
  return {
    push(kind, value, atMs) {
      crumbs.push({ at: atMs, kind, value: value ? value.slice(0, 80) : undefined });
      if (crumbs.length > max) crumbs.splice(0, crumbs.length - max);
    },
    snapshot(nowMs) {
      return crumbs.map((c) => {
        const ago = Math.round((c.at - nowMs) / MS_PER_TENTH) / TENTHS_PER_SECOND;
        return c.value ? `${ago}s ${c.kind} ${c.value}` : `${ago}s ${c.kind}`;
      });
    },
  };
}
