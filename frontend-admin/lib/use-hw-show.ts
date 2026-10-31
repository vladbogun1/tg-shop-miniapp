"use client";

/**
 * The live show state of the Halloween stream (events/halloween show.js) over Server-Sent Events:
 * which roll the OBS scene is playing, whether a scene is connected, blackout. The stream is opened
 * with the scene key from GET /show (it carries only what the stream shows anyway). Remove with the event.
 */
import { useEffect, useState } from "react";
import { hwDraw, type HwShow } from "@/lib/halloween-api";

/** An older unrevealed roll is not playing any more (same window as stage.js). */
export const HW_PLAY_WINDOW_MS = 5 * 60_000;

export function useHwShow(): { show: HwShow | null; stageKey: string; online: boolean } {
  const [show, setShow] = useState<HwShow | null>(null);
  const [stageKey, setStageKey] = useState("");
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    hwDraw.show().then(
      (s) => {
        if (closed) return;
        setStageKey(s.key);
        setShow(s);
        es = new EventSource(`/hw/api/stage/events?k=${encodeURIComponent(s.key)}&as=remote`);
        es.onmessage = (e) => {
          setOnline(true);
          setShow(JSON.parse(e.data) as HwShow);
        };
        // EventSource reconnects by itself; meanwhile the page says there is no link.
        es.onerror = () => setOnline(false);
      },
      () => setOnline(false)
    );
    return () => {
      closed = true;
      es?.close();
    };
  }, []);

  return { show, stageKey, online };
}

/** The roll the scene is playing now in this draw and mode. No scene connected → nothing plays. */
export function playingRoll(show: HwShow | null, pool: string, test: boolean) {
  const r = show?.roll;
  if (!show?.stages || !r || r.pool !== pool || r.test !== test || r.revealedAt) return null;
  return Date.now() - r.at < HW_PLAY_WINDOW_MS ? r : null;
}
