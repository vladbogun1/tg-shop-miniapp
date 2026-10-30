"use client";

/**
 * Единственный хост тостов. Лицо приложения (useUiLook) выбирает вид:
 *  - admin: карточка с цветной полоской, стопка в правом нижнем углу (на телефоне — над таб-баром);
 *  - miniapp / site: «таблетка» по центру снизу, один тост за раз (новый заменяет старый).
 */
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useUiLook, type UiLook } from "../look";
import { noFadeFlash } from "../motion";
import { dismissOtherToasts, dismissToast, getToasts, subscribeToasts, type ToastItem, type ToastKind } from "./store";

const EMPTY: readonly ToastItem[] = [];

function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY);
}

function defaultDuration(look: UiLook, hasAction: boolean): number {
  if (look === "admin") return hasAction ? 6000 : 3800;
  return hasAction ? 4200 : 2600;
}

/** Каждый тост гаснет сам через свой срок; таймеры снятых вручную тостов чистятся. */
function useAutoDismiss(items: readonly ToastItem[], look: UiLook): void {
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const live = new Set(items.map((t) => t.id));
    for (const [id, timer] of timers.current) {
      if (!live.has(id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
    for (const t of items) {
      if (timers.current.has(t.id)) continue;
      const ms = t.duration ?? defaultDuration(look, !!t.action);
      timers.current.set(t.id, setTimeout(() => dismissToast(t.id), ms));
    }
  }, [items, look]);
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);
}

export function Toaster() {
  const look = useUiLook();
  const items = useToasts();
  useAutoDismiss(items, look);
  return look === "admin" ? <AdminToasts items={items} /> : <CustomerToast items={items} look={look} />;
}

// ---- admin ----

const ADMIN_ICON: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[var(--ok)]" />,
  error: <AlertCircle className="h-[18px] w-[18px] shrink-0 text-[var(--danger)]" />,
  info: <Info className="h-[18px] w-[18px] shrink-0 text-[var(--accent)]" />,
};

const ADMIN_STRIPE: Record<ToastKind, string> = {
  success: "var(--ok)",
  error: "var(--danger)",
  info: "var(--accent)",
};

function AdminToasts({ items }: { items: readonly ToastItem[] }) {
  return (
    // Above the phone tab bar / home indicator; bottom-right corner on a computer.
    <div
      className="pointer-events-none fixed left-3 right-3 z-[400] flex flex-col items-end gap-2.5 sm:left-auto sm:right-5"
      style={{ bottom: "calc(max(var(--bottom-nav), var(--safe-bottom)) + 14px)" }}
    >
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="elevated pointer-events-auto relative flex max-w-[360px] items-center gap-3 overflow-hidden py-3 pl-4 pr-3"
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-[2px]" style={{ background: ADMIN_STRIPE[t.kind], boxShadow: `0 0 10px ${ADMIN_STRIPE[t.kind]}` }} />
            {ADMIN_ICON[t.kind]}
            <span className="text-[14px] leading-snug text-[var(--text)]">{t.text}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  dismissToast(t.id);
                }}
                className="font-display hit shrink-0 rounded-[var(--r-sm)] border border-[rgba(255,102,0,.4)] px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:bg-[var(--accent-soft)] pointer-coarse:py-1.5"
              >
                {t.action.label}
              </button>
            )}
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Закрыть уведомление"
              className="hit ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---- покупатель (Mini App, сайт) ----

function CustomerToast({ items, look }: { items: readonly ToastItem[]; look: "miniapp" | "site" }) {
  const current = items.length > 0 ? items[items.length - 1] : null;
  const currentId = current?.id;
  // Один тост за раз: пришёл новый — старые уходят, иначе после гашения нового всплыл бы прежний.
  useEffect(() => {
    if (currentId !== undefined) dismissOtherToasts(currentId);
  }, [currentId]);

  const miniapp = look === "miniapp";
  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 flex justify-center px-4 ${miniapp ? "z-[60]" : "bottom-6 z-[90]"}`}
      style={miniapp ? { bottom: "calc(110px + var(--safe-bottom))" } : undefined}
    >
      <AnimatePresence>
        {current && (
          // One element for as long as toasts keep coming: re-keying it per message made the old one
          // slide out NEXT to the new one in this flex row, so a quick second add made it jump sideways.
          // A new message only swaps the text (with a small pop) and restarts the timer.
          <motion.div
            key="toast"
            {...noFadeFlash}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`flex max-w-[92vw] items-center rounded-2xl border border-[var(--line-strong)] px-4 py-3 text-[14px] font-semibold text-[var(--ink)] ${
              miniapp
                ? "font-display gap-2 bg-[var(--surface-2)] shadow-[0_18px_40px_-12px_rgba(0,0,0,.7)]"
                : "gap-2.5 bg-[var(--surface)] shadow-[0_18px_40px_-14px_rgba(0,0,0,.8)]"
            }`}
          >
            {current.kind === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" strokeWidth={2.25} />
            ) : current.kind === "info" ? (
              <Info className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" strokeWidth={miniapp ? 2.75 : 2.25} />
            )}
            <span key={current.id} className="toast-pop">
              {current.text}
            </span>
            {current.action && (
              <button
                type="button"
                onClick={() => {
                  current.action?.onClick();
                  dismissToast(current.id);
                }}
                className="tap pointer-events-auto -my-1 -mr-1.5 ml-1 rounded-[var(--r)] border border-[rgba(255,102,0,.55)] bg-[var(--accent-soft)] px-3 py-1.5 font-display text-[12px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]"
              >
                {current.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
