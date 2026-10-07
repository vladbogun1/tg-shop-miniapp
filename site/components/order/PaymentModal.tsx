"use client";

/**
 * The monobank payment form inside our page (monobank `displayType: "iframe"`).
 *
 * Desktop: a centred window over the dimmed order page — a thin header (order, amount, ✕, "open in a
 * new tab") and the form at 600×680 (monobank wants at least 576×576). Phones (< 640px): a
 * full-screen sheet, the form fills it.
 *
 * While open it asks POST .../payment/refresh every 3 s and closes by itself once the order is paid.
 * The form talks to us with `postMessage`: `close-button` (the customer pressed "back" / "return to
 * the site", also after a finished payment) and `monopay-link` (a deep link into the mono app on a
 * phone). After paying, monobank navigates the frame to our /pay-return page, which posts
 * `{ source: "chisetup-pay", type: "done" }` to this window.
 *
 * "Open in a new tab" is the fallback for Apple Pay (it may refuse to run inside a frame) or a form
 * that misbehaves: it starts a normal (PAGE) invoice — which closes the framed one on the server —
 * and the modal then just waits for the payment.
 */
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { noFadeFlash, type OrderDetail, shortOrderId } from "@shop/shared";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { useFmt } from "@/lib/use-fmt";

/** Why the modal closed: paid; payment may have happened (check for a while); just dismissed. */
export type PaymentModalClose = "paid" | "check" | "dismiss";

const POLL_EVERY_MS = 3_000;

/** monobank's own hosts (the form lives on pay.mbnk.biz). Lenient on subdomains, strict on https. */
function isMonobankOrigin(origin: string, pageUrl: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "mbnk.biz" || h.endsWith(".mbnk.biz") || h === "monobank.ua" || h.endsWith(".monobank.ua")) return true;
    return u.origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}

/** `e.data` may be a JSON string, an object, or anything else other scripts post. Never eval'd. */
function readMessage(raw: unknown): { message?: unknown; value?: unknown } | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw || "{}");
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? (data as { message?: unknown; value?: unknown }) : null;
}

/** A deep link the form asks us to open: anything but script-ish schemes. */
function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value);
    if (["javascript:", "data:", "vbscript:", "file:", "blob:", "about:"].includes(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function PaymentModal({
  order,
  pageUrl,
  onOrder,
  onClose,
}: {
  order: OrderDetail;
  /** The framed (IFRAME) invoice page; null = not open. */
  pageUrl: string | null;
  /** Fresh order data from the polling. */
  onOrder: (d: OrderDetail) => void;
  onClose: (why: PaymentModalClose) => void;
}) {
  const hydrated = useHydrated();
  const open = pageUrl !== null;
  if (!hydrated) return null;
  return createPortal(
    <AnimatePresence>
      {open && <PaymentDialog key={pageUrl} order={order} pageUrl={pageUrl} onOrder={onOrder} onClose={onClose} />}
    </AnimatePresence>,
    document.body
  );
}

function PaymentDialog({
  order,
  pageUrl,
  onOrder,
  onClose,
}: {
  order: OrderDetail;
  pageUrl: string;
  onOrder: (d: OrderDetail) => void;
  onClose: (why: PaymentModalClose) => void;
}) {
  const { t, locale } = useI18n();
  const fmt = useFmt();
  const panelRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  /** The customer went to the new-tab fallback: the framed invoice is closed, we only wait. */
  const [external, setExternal] = useState(false);
  const [opening, setOpening] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Latest callbacks without restarting the listeners / the polling loop.
  const cb = useRef({ onOrder, onClose });
  useEffect(() => {
    cb.current = { onOrder, onClose };
  });
  const closed = useRef(false);
  const close = useCallback((why: PaymentModalClose) => {
    if (closed.current) return;
    closed.current = true;
    cb.current.onClose(why);
  }, []);

  useScrollLock(true);
  const dismiss = useCallback(() => close("dismiss"), [close]);
  useEscape(true, dismiss);

  // Focus: into the dialog on open, back to whatever opened it on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => before?.focus?.();
  }, []);

  // Basic focus trap: Tab cycles inside the dialog (the iframe is one stop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], iframe, [tabindex]:not([tabindex='-1'])")
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Messages from the monobank form and from our own /pay-return page inside it.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin) {
        const d = e.data as { source?: unknown; type?: unknown } | null;
        if (d && typeof d === "object" && d.source === "chisetup-pay" && d.type === "done") close("check");
        return;
      }
      if (!isMonobankOrigin(e.origin, pageUrl)) return;
      const data = readMessage(e.data);
      if (!data) return;
      if (data.message === "close-button") {
        close("check");
      } else if (data.message === "monopay-link") {
        const link = safeLink(data.value);
        if (link) window.location.href = link;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pageUrl, close]);

  // Status polling while open: paid → close; failure → keep open (the form shows it) with fresh data.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      let d: OrderDetail | null = null;
      try {
        d = await api.refreshPayment(order.id);
      } catch {
        /* throttled (1 per 5 s on the server) or offline — the next tick tries again */
      }
      if (cancelled) return;
      if (d) {
        cb.current.onOrder(d);
        if (d.paid || d.payment.status === "success") {
          close("paid");
          return;
        }
        if (d.status === "REJECTED") {
          close("dismiss");
          return;
        }
      }
      timer = window.setTimeout(tick, POLL_EVERY_MS);
    };
    timer = window.setTimeout(tick, POLL_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [order.id, close]);

  /** Fallback: the normal payment page in a new tab (opened synchronously, so it is not blocked). */
  async function openInNewTab() {
    setErr(null);
    const w = window.open("", "_blank");
    if (!w) {
      setErr(t("pay.modal.popupBlocked"));
      return;
    }
    try {
      w.opener = null;
    } catch {
      /* cross-origin already — fine */
    }
    setOpening(true);
    try {
      const start = await api.startPayment(order.id, locale);
      w.location.href = start.pageUrl;
      setExternal(true);
    } catch (e) {
      w.close();
      setErr(e instanceof ApiError ? e.message : t("pay.startFailed"));
    } finally {
      setOpening(false);
    }
  }

  const title = t("pay.modal.title", { id: shortOrderId(order.id), amount: fmt.money(order.amountDueMinor, order.currency) });

  return (
    <>
      <motion.div
        key="pay-backdrop"
        {...noFadeFlash}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-[6px]"
        aria-hidden
      />
      {/* Scrolls when the window is shorter than the form; a click beside the panel closes it. */}
      <div
        className="fixed inset-0 z-[80] flex overflow-y-auto overscroll-contain sm:justify-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) dismiss();
        }}
      >
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-modal-title"
          {...noFadeFlash}
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 32 } }}
          exit={{ opacity: 0, y: 28, transition: { duration: 0.18 } }}
          className="flex h-dvh w-full flex-col bg-[var(--bg)] pb-[var(--safe-bottom)] pt-[var(--safe-top)] sm:my-auto sm:h-auto sm:w-[616px] sm:max-w-full sm:rounded-[28px] sm:border sm:border-[var(--line-strong)] sm:p-2 sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,.9)]"
        >
          <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 sm:border-b-0 sm:px-3 sm:pb-2 sm:pt-1">
            <div className="min-w-0 flex-1">
              <h2
                id="pay-modal-title"
                className="truncate font-display text-[15px] font-bold uppercase tracking-[.04em] text-[var(--ink)]"
              >
                {title}
              </h2>
              <button
                type="button"
                disabled={opening}
                onClick={() => void openInNewTab()}
                className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-2 transition-colors hover:text-[var(--accent-hi)] disabled:opacity-60"
              >
                {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />}
                {t("pay.modal.newTab")}
              </button>
            </div>
            <button
              type="button"
              data-autofocus
              onClick={dismiss}
              aria-label={t("common.close")}
              className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] transition-colors hover:border-[var(--line-strong)]"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </header>

          {err && (
            <p
              role="alert"
              className="mx-4 mt-2 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2 text-[13px] font-medium text-[var(--danger)] sm:mx-1"
            >
              {err}
            </p>
          )}

          <div className="relative min-h-0 flex-1 sm:h-[min(680px,calc(100dvh-120px))] sm:min-h-[576px] sm:flex-none">
            {external ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" aria-live="polite">
                <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" strokeWidth={2.25} />
                <p className="font-display text-[16px] font-bold uppercase tracking-[.06em] text-[var(--ink)]">{t("pay.modal.inNewTab")}</p>
                <p className="max-w-[340px] text-[13px] font-medium text-[var(--muted)]">{t("pay.modal.inNewTabText")}</p>
              </div>
            ) : (
              <>
                {!loaded && (
                  <p className="absolute inset-0 flex items-center justify-center gap-2 text-[14px] font-medium text-[var(--muted)]" aria-live="polite">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" /> {t("pay.modal.loading")}
                  </p>
                )}
                <iframe
                  title="monopay"
                  src={pageUrl}
                  allow="payment *"
                  onLoad={() => setLoaded(true)}
                  className="relative block h-full w-full border-0 sm:rounded-[24px]"
                />
              </>
            )}
          </div>
        </motion.div>
      </div>
    </>
  );
}
