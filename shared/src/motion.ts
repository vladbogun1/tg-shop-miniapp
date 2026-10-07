/**
 * Framer Motion bits that every app uses the same way. Plain objects, so this package does not
 * depend on framer-motion; each app keeps its own variants (they differ per app) in `lib/motion.ts`.
 */

/** The default spring: quick, no wobble. Assignable to framer's `Transition`. */
export const spring = { type: "spring", stiffness: 380, damping: 32 } as const;

/**
 * Spread onto any motion element that fades `opacity` in or out (backdrops, lightbox, toasts).
 *
 * framer-motion 11 hands opacity to the browser (WAAPI). When that animation finishes it sets the
 * MotionValue (which only paints on the NEXT frame) and cancels the WAAPI animation right away, so
 * for one frame the element falls back to its inline style — the INITIAL opacity. Measured on the
 * product lightbox: 1 → 0 → 1 right after fading in, 0 → 1 → gone after fading out; that single
 * frame is the "blink" on open and on close. Any `onUpdate` handler makes framer keep the animation
 * on the main thread (it needs every value), where the final value is painted in the same frame.
 */
export const noFadeFlash = { onUpdate: () => {} } as const;
