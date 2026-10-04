"use client";

/**
 * Toast system (ChiSetup: graphite card, 2px status stripe on the left). Provider + useToast() hook.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastKind = "ok" | "error" | "info";
/** Optional button in the toast, e.g. «Отменить» right after a reversible action. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: ToastAction;
}

interface Ctx {
  push: (text: string, kind?: ToastKind, action?: ToastAction) => void;
}
const ToastCtx = createContext<Ctx>({ push: () => {} });

export function useToast(): Ctx {
  return useContext(ToastCtx);
}

let idSeq = 1;

const ICON = {
  ok: <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-[var(--ok)]" />,
  error: <AlertCircle className="h-[18px] w-[18px] shrink-0 text-[var(--danger)]" />,
  info: <Info className="h-[18px] w-[18px] shrink-0 text-[var(--accent)]" />,
};

const STRIPE = {
  ok: "var(--ok)",
  error: "var(--danger)",
  info: "var(--accent)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: ToastKind = "info", action?: ToastAction) => {
      const id = idSeq++;
      setToasts((t) => [...t, { id, kind, text, action }]);
      // An undo toast stays a little longer: the admin needs time to notice the mistake.
      setTimeout(() => remove(id), action ? 6000 : 3800);
    },
    [remove]
  );

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      {/* Above the phone tab bar / home indicator; bottom-right corner on a computer. */}
      <div
        className="pointer-events-none fixed left-3 right-3 z-[400] flex flex-col items-end gap-2.5 sm:left-auto sm:right-5"
        style={{ bottom: "calc(max(var(--bottom-nav), var(--safe-bottom)) + 14px)" }}
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="elevated pointer-events-auto relative flex max-w-[360px] items-center gap-3 overflow-hidden py-3 pl-4 pr-3"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-[2px]" style={{ background: STRIPE[t.kind], boxShadow: `0 0 10px ${STRIPE[t.kind]}` }} />
              {ICON[t.kind]}
              <span className="text-[14px] leading-snug text-[var(--text)]">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    remove(t.id);
                  }}
                  className="font-display hit shrink-0 rounded-[var(--r-sm)] border border-[rgba(255,102,0,.4)] px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[var(--accent-hi)] hover:bg-[var(--accent-soft)] pointer-coarse:py-1.5"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => remove(t.id)}
                aria-label="Закрыть уведомление"
                className="hit ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] text-[var(--text-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
