"use client";

import { useIsPresent } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../cn";

/** After this long a leaving layer is hidden for good, wherever its exit animation is. */
export const EXIT_HIDE_MS = 400;

/**
 * The full-screen positioning layer of an overlay, rendered as the direct (keyed) child of `AnimatePresence`.
 *
 * With framer-motion 11 the exit of an AnimatePresence child sometimes never completes (seen on iOS; earlier
 * for MobileMenu, Modal, the cards review panel), and the invisible layer then stayed on top swallowing every
 * tap until the admin re-entered. So a leaving layer stops taking taps at once (`pointer-events: none`,
 * `inert`, `aria-hidden`) and is hidden for good after {@link EXIT_HIDE_MS} (`visibility: hidden` — works on
 * iOS 15.4, where `inert` is a no-op). The animated backdrop / panel go inside as children.
 */
export function PresenceLayer({ name, className, children }: { name: string; className: string; children: ReactNode }) {
  const present = useIsPresent();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (present) return;
    const t = setTimeout(() => setGone(true), EXIT_HIDE_MS);
    return () => clearTimeout(t);
  }, [present]);
  return (
    <div
      data-overlay={name}
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      className={cn(className, !present && "pointer-events-none", gone && "invisible")}
    >
      {children}
    </div>
  );
}

/**
 * A fresh key per opening, for the {@link PresenceLayer} (computed during render, so the layer never remounts
 * while open): if the previous exit got stuck, the reopened overlay still mounts a new layer and enters.
 */
export function useOpenKey(open: boolean): number {
  const sessionRef = useRef(0);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) sessionRef.current += 1;
  wasOpen.current = open;
  return sessionRef.current;
}
