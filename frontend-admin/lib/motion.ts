/**
 * Framer Motion presets — shared animation language for admin v2.
 * Keep transitions springy but quick; motion serves the UX, never distracts.
 */
import type { Variants, Transition } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 380, damping: 32 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 30 };
export const ease: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };

/** Page-level fade + slight rise. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18 } },
};

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

/** Subtle hover lift for interactive cards. */
export const hoverLift = {
  whileHover: { y: -3, transition: spring },
  whileTap: { scale: 0.985 },
};
