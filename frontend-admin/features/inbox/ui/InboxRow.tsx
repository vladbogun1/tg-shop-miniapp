"use client";

/**
 * One row of «Внимание»: what, which order/product, how long it waits, the main action and
 * «Отложить» (+ «Разобрано» for informational rows).
 */
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { DesktopActions, PhoneActions, type RowActionsProps } from "./RowActions";
import { RowInfo } from "./RowInfo";

export function InboxRow({ isDesktop, ...actions }: RowActionsProps & { isDesktop: boolean }) {
  const { item, onPrimary } = actions;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      className="list-none"
    >
      <div
        className={cn(
          "card card-hover flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:gap-4 lg:p-3.5",
          // Overdue: a 2px red stripe inside the card + a reddish hairline.
          item.overdue &&
            "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] pl-4 shadow-[inset_2px_0_0_var(--danger),var(--shadow-1)] lg:pl-5"
        )}
      >
        <RowInfo item={item} onPrimary={onPrimary} />
        {isDesktop ? <DesktopActions {...actions} /> : <PhoneActions {...actions} />}
      </div>
    </motion.li>
  );
}
