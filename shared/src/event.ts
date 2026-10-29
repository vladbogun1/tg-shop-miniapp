/**
 * Halloween 2026 — a temporary event, removable in one commit (see events/halloween/README.md).
 *
 * The theme and the mascot swap switch themselves off at the end date: no redeploy needed to go
 * back to the normal look. The pumpkin hunt itself is the separate /hw/ service.
 */
export const HALLOWEEN_UNTIL = Date.parse("2026-11-01T22:00:00Z"); // 02.11.2026 00:00 Kyiv, after the stream

export function isHalloween(now: number = Date.now()): boolean {
  return now < HALLOWEEN_UNTIL;
}

/** The hunt (30.10–01.11) and the stream draw on 01.11 19:00: the home banners advertise it until the stream ends. */
export const HUNT_UNTIL = Date.parse("2026-11-01T20:00:00Z"); // 01.11.2026 22:00 Kyiv

export function isHuntOn(now: number = Date.now()): boolean {
  return now < HUNT_UNTIL;
}

/** `<html data-event>` value while the event runs. */
export const EVENT_ATTR = "halloween";

/** Which pictures have a redrawn copy (generated list). */
export { HW_SITE_ASSETS, HW_APP_ASSETS } from "./event-assets";
