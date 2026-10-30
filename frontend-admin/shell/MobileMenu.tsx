"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { SidebarInner } from "./Sidebar";

/**
 * Phone: the full menu («Ещё»). Always mounted and driven by `animate` rather than
 * AnimatePresence: an exit that never finished (route change mid-animation on iOS/Android)
 * used to leave the invisible full-screen backdrop on top, and no tap reached the app. Now
 * the closed state is pointer-events:none + inert regardless of where the animation is.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      <motion.div
        aria-hidden
        className={cn(
          "fixed inset-0 z-[70] bg-black/60 backdrop-blur-[6px] lg:hidden",
          !open && "pointer-events-none",
        )}
        initial={false}
        animate={
          open
            ? { opacity: 1, visibility: "visible" }
            : { opacity: 0, transitionEnd: { visibility: "hidden" } }
        }
        transition={{ duration: 0.2 }}
        onClick={() => onClose()}
      />
      <motion.aside
        aria-label="Все разделы"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "thin-scroll fixed inset-y-0 left-0 z-[80] flex w-[min(20rem,86vw)] flex-col overflow-y-auto rounded-r-[var(--r-xl)] border-r border-[var(--line-strong)] bg-[var(--surface)] pr-3 shadow-[var(--shadow-3)] lg:hidden",
          !open && "pointer-events-none",
        )}
        style={{
          paddingTop: "calc(12px + var(--safe-top))",
          paddingBottom: "calc(16px + var(--safe-bottom))",
          paddingLeft: "calc(12px + var(--safe-left))",
        }}
        initial={false}
        animate={
          open
            ? { x: 0, visibility: "visible" }
            : { x: "-105%", transitionEnd: { visibility: "hidden" } }
        }
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
      >
        <button
          onClick={() => onClose()}
          className="nb-press mb-1 ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]"
          aria-label="Закрыть меню"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarInner
          onNavigate={() => onClose()}
          layoutScope="drawer"
        />
      </motion.aside>
    </>
  );
}
