/**
 * Framer Motion presets — shared animation language for admin v2.
 * Keep transitions springy but quick; motion serves the UX, never distracts.
 */
import type { Variants, Transition } from "framer-motion";
import { spring } from "@shop/shared";

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

/** Modal/dialog pop. */
export const modalVariants: Variants = {
  initial: { opacity: 0, y: 24, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16 } },
};

/** The same dialog on a phone: a bottom sheet sliding up from the edge. */
export const sheetVariants: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { type: "spring", stiffness: 360, damping: 34 } },
  exit: { y: "100%", transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } },
};

/** Right-side drawer slide. */
export const drawerVariants: Variants = {
  initial: { x: "100%" },
  animate: { x: 0, transition: { type: "spring", stiffness: 320, damping: 36 } },
  exit: { x: "100%", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } },
};

export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
};
