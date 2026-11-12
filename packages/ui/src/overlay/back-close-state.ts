/**
 * History bookkeeping of {@link useBackToClose}, without React or `window` (unit-tested).
 *
 * Every opening writes its own token under its key (`__orderDrawer: "bc:3.k2x9q1"`), not `true`: a marker that
 * survived a reload / iOS tab eviction, or was left by an overlay closed from outside, used to look exactly like
 * the current one — Back then did not close the reopened order card, and its × popped one entry too many.
 *
 * `history.state` also carries Next's own keys (`__NA`, `__PRIVATE_NEXTJS_INTERNALS_TREE`); only values that are
 * provably ours are ever removed: a token string with our prefix, or the legacy `true` under this overlay's key.
 */
export type HistoryState = Record<string, unknown> | null | undefined;

const TOKEN_PREFIX = "bc:";
let seq = 0;

/** A token unique to one opening (counter for this page + random part for entries from before a reload). */
export function newToken(random: () => number = Math.random): string {
  seq += 1;
  return `${TOKEN_PREFIX}${seq}.${random().toString(36).slice(2, 8)}`;
}

function isToken(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(TOKEN_PREFIX);
}

/** The entry carries this opening's token. */
export function carries(state: HistoryState, key: string, token: string): boolean {
  return !!state && state[key] === token;
}

/**
 * The entry without stale markers, or `null` when there is nothing to clean. Stale = a token of ours that no open
 * overlay owns (`live`), or the legacy `true` under `key` (left by an older build).
 */
export function withoutStale(state: HistoryState, key: string, live: ReadonlySet<string>): Record<string, unknown> | null {
  if (!state) return null;
  let out: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(state)) {
    const stale = (isToken(v) && !live.has(v)) || (k === key && v === true);
    if (!stale) continue;
    out ??= { ...state };
    delete out[k];
  }
  return out;
}

/** The entry with this opening's token removed (other keys untouched). */
export function withoutKey(state: HistoryState, key: string): Record<string, unknown> {
  const rest = { ...(state ?? {}) };
  delete rest[key];
  return rest;
}

/** The entry for the opening: the current state plus our token. */
export function withToken(state: HistoryState, key: string, token: string): Record<string, unknown> {
  return { ...(state ?? {}), [key]: token };
}
