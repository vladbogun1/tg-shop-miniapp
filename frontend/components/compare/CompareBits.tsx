"use client";

/**
 * Small comparison controls of the Mini App:
 *   - CompareCardToggle: round button in the bottom-right corner of a catalog tile's photo;
 *   - CompareViewButton: chip in the product view (add / «У порівнянні · відкрити»);
 *   - CompareToastHost: the toast with the «Порівняти» button.
 */
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/context";
import { toggleCompare, useCompare, useInCompare } from "@/lib/compare";
import { haptic } from "@/lib/telegram";

/** Hydration guard: the list lives in localStorage, the first render must match the server's. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function CompareCardToggle({ productId, group }: { productId: string; group: string }) {
  const t = useT();
  const mounted = useMounted();
  const on = useInCompare(productId) && mounted;
  return (
    // a square layer over the photo (the tile's photo is a button, buttons cannot nest); the ⚖ sits
    // in its bottom-right corner — the top-right one ran into «В наличии» on a 320 px phone
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 aspect-square">
      <button
        type="button"
        aria-pressed={on}
        aria-label={on ? t("compare.remove") : t("compare.add")}
        onClick={(e) => {
          e.stopPropagation();
          haptic();
          toggleCompare(productId, group, t);
        }}
        className={`nb-press pointer-events-auto absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full border ${
          on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line-strong)] bg-[rgba(14,14,16,.86)] text-[var(--ink)]"
        }`}
      >
        {on ? <Check className="h-4 w-4" strokeWidth={2.75} /> : <Scale className="h-4 w-4" strokeWidth={2.25} />}
      </button>
    </div>
  );
}

export function CompareViewButton({ productId, group, onOpenComparison }: { productId: string; group: string; onOpenComparison: () => void }) {
  const t = useT();
  const mounted = useMounted();
  const on = useInCompare(productId) && mounted;
  const groupCount = useCompare((s) => s.entries.filter((e) => e.group === group).length);
  return (
    <span className="mt-2 inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          haptic();
          toggleCompare(productId, group, t);
        }}
        className={`nb-chip nb-press inline-flex min-h-[32px] items-center gap-1.5 px-3 py-1 text-[12.5px] ${on ? "nb-chip-active" : ""}`}
      >
        {on ? <Check className="h-3.5 w-3.5" strokeWidth={2.75} /> : <Scale className="h-3.5 w-3.5" strokeWidth={2.25} />}
        {on ? t("compare.inList") : t("compare.add")}
      </button>
      {on && (
        <button
          type="button"
          onClick={() => {
            haptic();
            onOpenComparison();
          }}
          className="font-display inline-flex min-h-[32px] items-center gap-0.5 px-1.5 text-[12.5px] font-semibold text-[var(--accent-hi)]"
        >
          {t("compare.openN", { n: groupCount })}
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
}

export function CompareToastHost() {
  const t = useT();
  const toast = useCompare((s) => s.toast);
  const hide = useCompare((s) => s.hideToast);
  const openScreen = useCompare((s) => s.openScreen);
  const screenOpen = useCompare((s) => s.open);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(hide, toast.openGroup ? 4000 : 2200);
    return () => window.clearTimeout(id);
  }, [toast, hide]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          // one element while toasts keep coming (re-keying made a quick second add flash and jump)
          key="cmp-toast"
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="font-display fixed inset-x-0 z-[80] mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface-2)] py-2.5 pl-4 pr-2.5 text-[14px] font-semibold text-[var(--ink)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.7)]"
          style={{ bottom: screenOpen ? "calc(20px + var(--safe-bottom))" : "calc(var(--tabbar-h) + 28px + var(--safe-bottom))" }}
        >
          {toast.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={2.75} />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" strokeWidth={2.5} />
          )}
          <span key={toast.id} className="toast-pop min-w-0 py-1">
            {toast.text}
          </span>
          {toast.openGroup && !screenOpen && (
            <button
              type="button"
              onClick={() => {
                haptic();
                openScreen(toast.openGroup);
              }}
              className="nb-press ml-1 shrink-0 rounded-[var(--r)] bg-[var(--accent)] px-3 py-2 text-[12px] font-bold uppercase tracking-[.06em] text-[var(--accent-ink)]"
            >
              {t("compare.open")}
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
