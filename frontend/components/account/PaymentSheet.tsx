"use client";

/**
 * The monobank payment form INSIDE the Mini App: a full-screen sheet with the bank's page in an
 * iframe (an invoice created with displayType=iframe — customerApi.startPayment(…, "IFRAME")), so
 * the customer never leaves Telegram.
 *
 * Layout: a thin header "Оплата · {amount}" with ✕, the frame filling the rest, and a footer link
 * "Відкрити в браузері (Apple Pay / Google Pay)" — wallets usually do not work inside Telegram's
 * webview, so that link falls back to the regular page in the browser (the caller's openLink flow).
 * The sheet sits above the TabBar and the notifications modal, respects the safe-area insets,
 * locks the page scroll and routes Telegram's back button (and Android's hardware back) to close.
 *
 * monobank does not fit its documented 576×576 minimum on a phone: the frame is simply 100% wide
 * and as tall as the screen allows; its page is responsive and scrolls inside the frame.
 *
 * Messages from the frame (parsed defensively — strings or objects, never evaluated):
 *   - monobank `{"message":"close-button"}` → onClose("bank");
 *   - monobank `{"message":"monopay-link","value":url}` → open the monobank app (openAppLink);
 *   - ours `{source:"chisetup-pay",type:"done",order}` from /pay-return?embedded=1, where monobank
 *     sends the frame after paying → onClose("done").
 * Only messages coming from this frame's window (or, leniently, from a monobank origin) count.
 *
 * The parent (OrderPayment) owns the polling and decides what each close means.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/i18n/context";
import { overlayRise } from "@/lib/motion";
import { haptic, openAppLink, useBackButton } from "@/lib/telegram";

export type PaymentSheetClose = "user" | "bank" | "done";

const BANK_ORIGIN = /(^|\.)(mbnk\.biz|monobank\.ua)$/i;

function bankOrigin(origin: string): boolean {
  try {
    return BANK_ORIGIN.test(new URL(origin).hostname);
  } catch {
    return false;
  }
}

/** `e.data` as an object: monobank posts JSON strings, we post objects; anything else → null. */
function readData(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function PaymentSheet({
  url,
  orderId,
  amount,
  browserLoading,
  onClose,
  onBrowser,
}: {
  /** The iframe page; null = closed. */
  url: string | null;
  orderId: string;
  /** Formatted amount for the header. */
  amount: string;
  /** The browser fallback is being prepared (new invoice). */
  browserLoading: boolean;
  onClose: (why: PaymentSheetClose) => void;
  /** "Відкрити в браузері" — the regular page via WebApp.openLink. */
  onBrowser: () => void;
}) {
  const t = useT();
  const open = url !== null;
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => setLoaded(false), [url]);

  useBackButton(open, () => onCloseRef.current("user"));

  // Page scroll stays put under the sheet (iOS rubber-banding the shop behind the bank form).
  useEffect(() => {
    if (!open) return;
    const body = document.body.style;
    const html = document.documentElement.style;
    const prev = [body.overflow, html.overflow, html.overscrollBehavior];
    body.overflow = "hidden";
    html.overflow = "hidden";
    html.overscrollBehavior = "none";
    return () => {
      [body.overflow, html.overflow, html.overscrollBehavior] = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMessage(e: MessageEvent) {
      const fromFrame = !!frame.current && e.source === frame.current.contentWindow;
      if (!fromFrame && !bankOrigin(e.origin)) return;
      const data = readData(e.data);
      if (!data) return;
      if (data.source === "chisetup-pay") {
        // Our /pay-return — same origin as this page, posted from inside the frame.
        if (data.type === "done" && (data.order == null || data.order === orderId)) {
          onCloseRef.current("done");
        }
        return;
      }
      if (data.message === "close-button") {
        onCloseRef.current("bank");
      } else if (data.message === "monopay-link" && typeof data.value === "string") {
        openAppLink(data.value);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, orderId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="pay-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t("pay.sheetTitle", { amount })}
          variants={overlayRise}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed inset-x-0 top-0 z-[130] flex h-[100dvh] flex-col bg-[var(--bg)]"
          style={{
            paddingLeft: "var(--safe-left)",
            paddingRight: "var(--safe-right)",
            overscrollBehavior: "contain",
          }}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 pb-2.5"
            style={{ paddingTop: "max(10px, var(--safe-top))" }}
          >
            <h2 className="font-display min-w-0 truncate text-[15px] font-extrabold uppercase tracking-[0.04em] text-[var(--ink)]">
              {t("pay.sheetTitle", { amount })}
            </h2>
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.07 }}
              onClick={() => {
                haptic();
                onClose("user");
              }}
              className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] hover:text-[var(--ink)]"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </motion.button>
          </div>

          <div className="relative min-h-0 flex-1 px-2 pt-2">
            {!loaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--muted)]">
                <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" strokeWidth={2.5} />
                <span className="font-display text-[12px] font-semibold uppercase tracking-[0.08em]">
                  {t("pay.sheetLoading")}
                </span>
              </div>
            )}
            <iframe
              ref={frame}
              key={url}
              src={url}
              title="monopay"
              allow="payment *"
              onLoad={() => setLoaded(true)}
              className="relative block h-full w-full border-0 bg-white transition-opacity duration-200"
              style={{ borderRadius: 24, opacity: loaded ? 1 : 0 }}
            />
          </div>

          <div
            className="shrink-0 px-4 pt-2"
            style={{ paddingBottom: "calc(8px + var(--safe-bottom))" }}
          >
            <button
              type="button"
              disabled={browserLoading}
              onClick={() => {
                haptic();
                onBrowser();
              }}
              className="tap flex min-h-[40px] w-full items-center justify-center gap-2 text-[12.5px] font-semibold text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-60"
            >
              {browserLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
              ) : (
                <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
              )}
              <span className="underline decoration-[var(--line-strong)] underline-offset-4">
                {t("pay.openBrowser")}
              </span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
