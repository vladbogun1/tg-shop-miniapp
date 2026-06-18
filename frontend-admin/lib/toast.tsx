"use client";

/**
 * Tiny glass toast system (design doc §8.4 "tosty steklyannye").
 * Provider + useToast() hook. No external deps.
 */
import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, kind: ToastKind = "info") => {
    const id = idSeq++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="glass glass--floating pointer-events-auto flex max-w-[340px] items-center gap-2.5 rounded-[var(--r-md)] px-4 py-3 text-[14px]"
            >
              {t.kind === "ok" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" />
              )}
              {t.kind === "error" && (
                <AlertCircle className="h-4 w-4 shrink-0 text-[var(--danger)]" />
              )}
              {t.kind === "info" && (
                <Info className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              )}
              <span className="text-[var(--text)]">{t.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
