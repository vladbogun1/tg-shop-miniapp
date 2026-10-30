/** Motion of admin overlays (Modal, Drawer, ActionSheet). */
import type { Variants } from "framer-motion";
import { spring } from "../motion";

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
