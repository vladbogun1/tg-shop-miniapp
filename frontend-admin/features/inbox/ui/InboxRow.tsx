"use client";

/**
 * One row of «Внимание» on a laptop / tablet: two lines of text, the main action and «⋯»
 * («Отложить» presets + «Разобрано» for informational rows).
 */
import { cn } from "@/lib/cn";
import { DesktopActions, type RowActionsProps } from "./RowActions";
import { RowInfo } from "./RowInfo";

export function InboxRow(props: RowActionsProps) {
  const { item, onPrimary } = props;
  return (
    <li
      className={cn(
        "card card-hover flex min-h-[56px] list-none items-center gap-3 px-3 py-2.5",
        // Overdue: a 2px red stripe inside the card + a reddish hairline.
        item.overdue && "border-[color-mix(in_srgb,var(--danger)_35%,transparent)] shadow-[inset_2px_0_0_var(--danger),var(--shadow-1)]"
      )}
    >
      <RowInfo item={item} onPrimary={onPrimary} />
      <DesktopActions {...props} />
    </li>
  );
}
