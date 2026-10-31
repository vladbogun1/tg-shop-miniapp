"use client";

import { useIsPresent } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The positioning layer of the open panel. As with the Modal (components/ui/Modal.tsx, ModalLayer):
 * with framer-motion 11 the exit of an AnimatePresence child sometimes never completes, and the
 * invisible panel would then swallow every click — so a leaving layer stops taking clicks at once
 * and is hidden for good shortly after.
 */
export function PanelLayer({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (present) return;
    const t = setTimeout(() => setGone(true), 400);
    return () => clearTimeout(t);
  }, [present]);
  return (
    <div
      inert={!present || undefined}
      aria-hidden={!present || undefined}
      className={cn("fixed inset-0 z-[120]", !present && "pointer-events-none", gone && "invisible")}
    >
      {children}
    </div>
  );
}
