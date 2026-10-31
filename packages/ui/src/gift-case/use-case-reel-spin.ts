"use client";

/** Прокрутка барабана кейса: анимация ленты к призу, тики и haptic при пересечении метки, «линии скорости». */
import { animate, type AnimationPlaybackControls, type MotionValue } from "framer-motion";
import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { useLatest } from "../use-latest";
import { caseReelOffset, type GiftCaseOpen } from "@shop/core/giftcase";
import { caseStopSound, caseTick } from "./case-audio";
import { SPIN_EASE, SPIN_SECONDS, type Stage } from "./case-opening-bits";
import type { GiftCaseHaptics } from "./case-opening-types";

type HapticsRef = MutableRefObject<GiftCaseHaptics | undefined>;

/** `onUpdate` of the reel: a tick + haptic per tile crossing the marker (throttled), speed lines follow the velocity (opacity only). */
function reelUpdateHandler(vw: number, step: number, speedRef: RefObject<HTMLDivElement | null>, hapticsRef: HapticsRef) {
  let lastIdx = Math.floor((vw / 2) / step);
  let lastTick = 0;
  let lastHaptic = 0;
  let lastX = 0;
  let lastT = performance.now();
  return (v: number) => {
    const idx = Math.floor((-v + vw / 2) / step);
    const now = performance.now();
    if (idx !== lastIdx) {
      lastIdx = idx;
      if (now - lastTick > 28) {
        lastTick = now;
        caseTick();
      }
      if (now - lastHaptic > 70) {
        lastHaptic = now;
        hapticsRef.current?.tick?.();
      }
    }
    // speed lines: opacity only, follows the velocity
    const dt = Math.max(1, now - lastT);
    const speed = Math.abs(v - lastX) / dt; // px per ms
    lastX = v;
    lastT = now;
    if (speedRef.current) speedRef.current.style.opacity = String(Math.min(0.9, Math.max(0, (speed - 0.6) / 4)));
  };
}

interface ReelRun {
  vp: HTMLDivElement;
  tile: { w: number; gap: number };
  x: MotionValue<number>;
  anim: MutableRefObject<AnimationPlaybackControls | null>;
  speedRef: RefObject<HTMLDivElement | null>;
  alive: MutableRefObject<boolean>;
  hapticsRef: HapticsRef;
  onFinished: () => void;
}

/** Starts the slide on the next frame; returns the cancel function. */
function startReel({ vp, tile, x, anim, speedRef, alive, hapticsRef, onFinished }: ReelRun): () => void {
  const vw = vp.clientWidth;
  const step = tile.w + tile.gap;
  const target = caseReelOffset({ tileWidth: tile.w, gap: tile.gap, viewportWidth: vw, jitter: 0.2 + Math.random() * 0.6 });
  const onUpdate = reelUpdateHandler(vw, step, speedRef, hapticsRef);
  const raf = requestAnimationFrame(() => {
    anim.current = animate(x, -target, {
      duration: SPIN_SECONDS,
      ease: SPIN_EASE,
      onUpdate,
      onComplete: () => {
        if (!alive.current) return;
        if (speedRef.current) speedRef.current.style.opacity = "0";
        caseStopSound();
        hapticsRef.current?.stop?.();
        onFinished();
      },
    });
  });
  return () => {
    cancelAnimationFrame(raf);
    anim.current?.stop();
  };
}

interface ReelSpinArgs {
  stage: Stage;
  result: GiftCaseOpen | null;
  run: number;
  vpEl: HTMLDivElement | null;
  tile: { w: number; gap: number };
  x: MotionValue<number>;
  anim: MutableRefObject<AnimationPlaybackControls | null>;
  speedRef: RefObject<HTMLDivElement | null>;
  alive: MutableRefObject<boolean>;
  hapticsRef: HapticsRef;
  /** The reel stopped: the caller flips `spinDone` and schedules the reveal. */
  onStopped: (res: GiftCaseOpen) => void;
}

/** Drives the reel once the strip for this run is on screen (one animation per `run`). */
export function useReelSpin({ stage, result, run, vpEl, tile, x, anim, speedRef, alive, hapticsRef, onStopped }: ReelSpinArgs) {
  const spunRun = useRef(0);
  const live = useLatest({ stage, result, tile, x, anim, speedRef, alive, hapticsRef, onStopped });
  useEffect(() => {
    const { stage, result, tile, x, anim, speedRef, alive, hapticsRef, onStopped } = live.current;
    if (stage !== "spin" || !result || run === 0 || spunRun.current === run) return;
    if (!vpEl) return;
    spunRun.current = run;
    const res = result;
    const cancel = startReel({ vp: vpEl, tile, x, anim, speedRef, alive, hapticsRef, onFinished: () => onStopped(res) });
    return () => {
      cancel();
      spunRun.current = 0;
    };
  }, [run, vpEl, live]);
}
