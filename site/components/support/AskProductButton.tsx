"use client";

/**
 * «Запитати про товар» under the buy box. Signed in → a dialog with the question form; the new (or
 * the already open) thread about this product opens afterwards. Guest → the usual sign-in through
 * the bot, which then continues on /account/support/new?product=<id> (the same form as a page).
 * Hidden while support is off or its config is unknown.
 */
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircleQuestion, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/context";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { noFadeFlash } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { useSupportConfig } from "@/lib/support";
import { SupportQuestionForm } from "./SupportQuestionForm";

export function AskProductButton({ productId, productTitle }: { productId: string; productTitle: string }) {
  const { t, href } = useI18n();
  const router = useRouter();
  const { enabled } = useSupportConfig();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!enabled) return null;

  function onClick() {
    if (session.status === "authed") {
      setOpen(true);
      return;
    }
    const next = href(`/account/support/new?product=${encodeURIComponent(productId)}`);
    router.push(href(`/login?next=${encodeURIComponent(next)}`));
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={session.status === "loading"}
        className="tap mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[var(--line-strong)] bg-transparent px-4 font-display text-[13px] font-semibold uppercase tracking-[.08em] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)] disabled:opacity-60 sm:w-auto"
      >
        <MessageCircleQuestion className="h-4 w-4" strokeWidth={2.25} />
        {t("support.ask")}
      </button>
      <AskDialog
        open={open}
        onClose={close}
        productId={productId}
        productTitle={productTitle}
        onCreated={(id) => {
          setOpen(false);
          router.push(href(`/account/support/${id}`));
        }}
      />
    </>
  );
}

function AskDialog({
  open,
  onClose,
  productId,
  productTitle,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productTitle: string;
  onCreated: (threadId: string) => void;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <AskPanel key="ask" onClose={onClose} productId={productId} productTitle={productTitle} onCreated={onCreated} />
      )}
    </AnimatePresence>,
    document.body
  );
}

function AskPanel({
  onClose,
  productId,
  productTitle,
  onCreated,
}: {
  onClose: () => void;
  productId: string;
  productTitle: string;
  onCreated: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useEscape(true, onClose);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);

  return (
    <>
      <motion.div
        {...noFadeFlash}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[6px]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-[71] flex items-end justify-center sm:items-center sm:p-4">
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ask-title"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 340, damping: 34 }}
          className="pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[16px] border border-[var(--line-strong)] bg-[var(--surface)] sm:max-w-[520px] sm:rounded-[16px]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
            <div className="min-w-0">
              <h2 id="ask-title" className="font-display text-[17px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
                {t("support.ask.title")}
              </h2>
              <p className="mt-0.5 line-clamp-2 text-[13px] font-medium text-[var(--muted)]">{productTitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-4">
            <p className="mb-3 text-[14px] text-[var(--muted)]">{t("support.ask.lead")}</p>
            <SupportQuestionForm productId={productId} autoFocus onCreated={(th) => onCreated(th.id)} />
          </div>
        </motion.div>
      </div>
    </>
  );
}
