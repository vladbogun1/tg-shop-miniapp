/**
 * Halloween 2026 — a temporary event, removable in one commit (see events/halloween/README.md).
 *
 * The theme and the mascot swap switch themselves off at the end date: no redeploy needed to go
 * back to the normal look. The pumpkin hunt itself is the separate /hw/ service.
 */
export const HALLOWEEN_UNTIL = Date.parse("2026-10-31T22:00:00Z"); // 01.11.2026 00:00 Kyiv

export function isHalloween(now: number = Date.now()): boolean {
  return now < HALLOWEEN_UNTIL;
}

/** `<html data-event>` value while the event runs. */
export const EVENT_ATTR = "halloween";
