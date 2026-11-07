"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Sticky under the shell's top bar (--hdr-h). On a phone it folds up by the search row's height
 * (`folded`), so the tabs under it stay pinned; opaque, or the folded search would show through the bar.
 */
export function OrdersStickyPanel({ phone, folded, onFocus, top, children }: { phone: boolean; folded: boolean; onFocus: () => void; top: ReactNode; children?: ReactNode }) {
  const foldedPhone = phone && folded;
  return (
    <div
      onFocusCapture={onFocus}
      className={cn(
        "sticky top-[var(--hdr-h,61px)] z-20 -mx-4 bg-[var(--bg)] px-4 lg:-mx-7 lg:px-7",
        phone && "transition-transform duration-200",
        foldedPhone && "-translate-y-[52px]"
      )}
    >
      <div inert={foldedPhone ? true : undefined} className={cn(phone && "transition-opacity duration-150", foldedPhone && "opacity-0")}>
        {top}
      </div>
      {children}
    </div>
  );
}
