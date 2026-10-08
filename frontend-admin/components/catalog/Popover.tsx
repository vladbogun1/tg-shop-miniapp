"use client";

/**
 * Anchored dropdown panel for the catalog pickers (tree-select, brand combobox): rendered in a
 * portal (never clipped by a modal's scroll box), follows the anchor on scroll/resize, opens
 * upwards when there is no room below, closes on an outside press and on Esc — as an overlay
 * layer, so Esc closes the dropdown and not the wizard under it.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useOverlayLayer } from "@/lib/overlay-stack";
import { cn } from "@/lib/cn";

export function Popover({
  open,
  anchorRef,
  onClose,
  children,
  className,
  maxHeight = 340,
  minWidth = 260,
  panelRef,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  maxHeight?: number;
  minWidth?: number;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useOverlayLayer(open, onClose, { lockScroll: false });

  useLayoutEffect(() => {
    if (open && anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    };
    const reposition = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("touchstart", close);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("touchstart", close);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, onClose, anchorRef, panelRef]);

  if (typeof document === "undefined") return null;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const below = rect ? vh - rect.bottom - 12 : 0;
  const above = rect ? rect.top - 12 : 0;
  const up = rect ? below < Math.min(maxHeight, 220) && above > below : false;
  const height = Math.max(160, Math.min(maxHeight, up ? above : below));
  const width = rect ? Math.min(Math.max(rect.width, minWidth), vw - 16) : minWidth;
  const left = rect ? Math.max(8, Math.min(rect.left, vw - width - 8)) : 0;

  return createPortal(
    <AnimatePresence>
      {open && rect && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: up ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: up ? 6 : -6, scale: 0.98 }}
          transition={{ duration: 0.14 }}
          style={{
            position: "fixed",
            left,
            width,
            maxHeight: height,
            zIndex: 210,
            ...(up ? { bottom: vh - rect.top + 6 } : { top: rect.bottom + 6 }),
          }}
          className={cn("elevated flex flex-col overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
