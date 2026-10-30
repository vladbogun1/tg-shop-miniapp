/**
 * Framer Motion presets — shared animation language for admin v2.
 * Keep transitions springy but quick; motion serves the UX, never distracts.
 */
import type { Variants, Transition } from "framer-motion";
import { spring } from "@shop/ui/motion";

export { spring };
export const ease: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

/** Stagger container for lists/grids. */
export const staggerContainer: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

/** Item that rises into place — pair with staggerContainer. */
export const riseItem: Variants = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

