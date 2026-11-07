"use client";

import { useMediaQuery } from "@shop/ui/use-media";

/**
 * Tablet and up (Tailwind `md`, 768px): the orders board is a kanban that scrolls inside itself.
 * Below it: status tabs + one list on a page that scrolls as a whole. The first render assumes the
 * kanban (like the old `useIsDesktop`), then follows the real viewport.
 */
export function useIsKanban(): boolean {
  return useMediaQuery("(min-width: 768px)", true);
}
