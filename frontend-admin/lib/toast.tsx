"use client";

/**
 * Toast system (Aurora). Provider + useToast() hook. No external deps.
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
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface Ctx {
  push: (text: string, kind?: ToastKind) => void;
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: ToastKind = "info") => {
      const id = idSeq++;
      setToasts((t) => [...t, { id, kind, text }]);
      setTimeout(() => remove(id), 3800);
    },
    [remove]
  );

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[400] flex flex-col gap-2.5">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="elevated pointer-events-auto flex max-w-[360px] items-center gap-3 px-4 py-3"
            >
              {ICON[t.kind]}
              <span className="text-[14px] leading-snug text-[var(--text)]">{t.text}</span>
              <button
                onClick={() => remove(t.id)}
                className="ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
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
