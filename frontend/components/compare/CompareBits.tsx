"use client";

/**
 * Small comparison controls of the Mini App:
 *   - CompareFab: floating «⚖ Порівняння · N» over the catalog, above the tab bar, thumb reach;
 *   - CompareCardToggle: round button in the top-right corner of a catalog tile (over the photo,
 *     outside the tile's own button — buttons cannot nest);
 *   - CompareViewButton: chip in the product view (add / «У порівнянні · відкрити»);
 *   - CompareToastHost: the toast with the «Порівняти» button.
 */
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/context";
import { toggleCompare, useCompare, useCompareCount, useInCompare } from "@/lib/compare";
import { haptic } from "@/lib/telegram";

/** Hydration guard: the list lives in localStorage, the first render must match the server's. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function CompareFab() {
  const t = useT();
  const mounted = useMounted();
  const count = useCompareCount();
  const openScreen = useCompare((s) => s.openScreen);
  const show = mounted && count > 0;
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="cmp-fab"
          type="button"
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          onClick={() => {
            haptic();
            openScreen();
          }}
          aria-label={t("compare.headerCount", { n: count })}
          className="nb-press font-display fixed right-4 z-[35] inline-flex h-11 items-center gap-2 rounded-full border border-[var(--accent)] pl-3.5 pr-4 text-[13px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)] shadow-[0_12px_30px_-10px_rgba(0,0,0,.85)] backdrop-blur-[10px]"
          style={{ bottom: "calc(var(--tabbar-h) + max(8px, var(--safe-bottom)) + 12px)", background: "rgba(26,18,12,.92)" }}
        >
          <Scale className="h-[18px] w-[18px]" strokeWidth={2.25} />
          {t("compare.title")}
          <span key={count} className="cmp-bump grid h-[20px] min-w-[20px] place-items-center rounded-full bg-[var(--accent)] px-1 text-[11px] leading-none text-[var(--accent-ink)]">
            {count}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function CompareCardToggle({ productId, group }: { productId: string; group: string }) {
  const t = useT();
  const mounted = useMounted();
  const on = useInCompare(productId) && mounted;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("compare.remove") : t("compare.add")}
      onClick={(e) => {
        e.stopPropagation();
        haptic();
        toggleCompare(productId, group, t);
      }}
      className={`nb-press absolute right-1.5 top-1.5 z-10 grid h-9 w-9 place-items-center rounded-full border ${
        on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--line-strong)] bg-[rgba(14,14,16,.86)] text-[var(--ink)]"
      }`}
    >
      {on ? <Check className="h-4 w-4" strokeWidth={2.75} /> : <Scale className="h-4 w-4" strokeWidth={2.25} />}
    </button>
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
          key={toast.id}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="font-display fixed inset-x-0 z-[80] mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-[16px] border border-[var(--line-strong)] bg-[var(--surface-2)] py-2.5 pl-4 pr-2.5 text-[14px] font-semibold text-[var(--ink)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.7)]"
          style={{ bottom: screenOpen ? "calc(20px + var(--safe-bottom))" : "calc(var(--tabbar-h) + 84px + var(--safe-bottom))" }}
        >
          {toast.kind === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={2.75} />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" strokeWidth={2.5} />
          )}
          <span className="min-w-0 py-1">{toast.text}</span>
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
