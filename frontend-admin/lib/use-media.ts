"use client";

import { useMediaQuery } from "@shop/ui/use-media";

/** Tailwind `lg` breakpoint — where the board switches from the mobile list to the kanban. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)", true);
}

/** Touch-first device: Enter in the chat inserts a new line instead of sending. */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)", false);
}
