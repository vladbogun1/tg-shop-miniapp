"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@shop/ui/admin-button";
import { cn } from "@/lib/cn";
import { SNOOZE_OPTIONS, type SnoozePreset } from "../model/types";

/** «Отложить ▾» with the three presets (desktop). Esc / a click outside closes it. */
export function SnoozeMenu({ onPick }: { onPick: (p: SnoozePreset) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="md"
        icon={<Clock className="h-4 w-4" />}
        iconRight={<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Отложить
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="elevated absolute right-0 top-[calc(100%+6px)] z-20 flex w-48 flex-col overflow-hidden !rounded-[var(--r-md)] p-1"
          >
            {SNOOZE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(o.value);
                }}
                className="rounded-[var(--r-sm)] px-3 py-2 text-left text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-none"
              >
                {o.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
