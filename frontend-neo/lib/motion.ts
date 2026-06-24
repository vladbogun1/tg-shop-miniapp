/**
 * Framer Motion presets for the customer Mini App. Springy, quick, tasteful.
 */
import type { Variants, Transition } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 380, damping: 32 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30 };

export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};

export const riseItem: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

/** Bottom sheet slide-up. */
export const sheetVariants: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { type: "spring", stiffness: 320, damping: 34 } },
  exit: { y: "100%", transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
};

/** Full-screen overlay rise. */
export const overlayRise: Variants = {
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 32 } },
  exit: { opacity: 0, y: 28, transition: { duration: 0.2 } },
};

export const backdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};
