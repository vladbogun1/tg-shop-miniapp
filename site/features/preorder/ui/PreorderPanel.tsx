"use client";

/**
 * «Їде до нас» block of the product page (docs/PREORDERS-PLAN.md §4.2): a 3-step timeline, the
 * expected time, how many people wait, the shop's public note and the button that puts the
 * customer in the queue (a sheet with the quantity). Without an open batch (`eta` null) it is just
 * the «Повідомити, коли з'явиться» button. The customer's own place replaces the button with
 * «Ви в черзі · №N · k шт» and «Вийти з черги».
 *
 * A guest is sent to the sign-in page and brought back to the product afterwards.
 */
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Loader2, Send, Truck, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { noFadeFlash } from "@shop/ui/motion";
import { Button, QtyStepper } from "@shop/ui/primitives";
import { toast } from "@shop/ui/toast";
import { useI18n } from "@/i18n/context";
import { BOT_URL } from "@/lib/config";
import { useEscape, useHydrated, useScrollLock } from "@/lib/hooks";
import { useOrderLimits } from "@/features/cart";
import { DEFAULT_HOLD_HOURS, expectedLine, type MyPreorder, MY_PREORDERS_KEY, preorderApi, type PreorderEta, preorderErrorCode, productPreorderKey } from "@/features/preorder";
import { useSession } from "@/features/auth";

/** Violet «on its way» chip used by the tile and the product page. */
export function PreorderBadge({ className = "", label }: { className?: string; label: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--pre)_55%,transparent)] bg-[rgba(14,14,16,.86)] px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[.05em] text-[var(--pre)] ${className}`}
    >
      <Truck className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Замовлено → В дорозі → На складі; the current step is filled. */
function Timeline({ stage }: { stage: PreorderEta["stage"] }) {
  const { t } = useI18n();
  const steps = [
    { key: "preorder.step.ordered", done: true, now: stage === "ordered" },
    { key: "preorder.step.transit", done: stage === "in_transit", now: stage === "in_transit" },
    { key: "preorder.step.stock", done: false, now: false },
  ] as const;
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label={t("preorder.panel.title")}>
      {steps.map((s, i) => (
        <li key={s.key} className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 ${
                s.done ? "border-[var(--pre)] bg-[var(--pre)]" : "border-[var(--line-strong)] bg-transparent"
              } ${s.now ? "shadow-[0_0_10px_var(--pre)]" : ""}`}
            />
            {i < steps.length - 1 && (
              <span aria-hidden className={`h-[2px] flex-1 rounded ${steps[i + 1].done ? "bg-[var(--pre)]" : "bg-[var(--line-strong)]"}`} />
            )}
          </div>
          <p className={`mt-1.5 text-[12px] font-semibold leading-tight ${s.done ? "text-[var(--ink)]" : "text-[var(--faint)]"}`}>
            {t(s.key)}
          </p>
        </li>
      ))}
    </ol>
  );
}

type TFn = ReturnType<typeof useI18n>["t"];

/** Title, timeline, expected time, how many wait and the shop's note — only with an open batch. */
function EtaInfo({ eta, expected, waitingCount, t }: { eta: PreorderEta; expected: string | null; waitingCount: number | null; t: TFn }) {
  return (
    <>
      <p className="flex items-center gap-2 font-display text-[16px] font-extrabold uppercase tracking-[.04em] text-[var(--ink)]">
        <Truck className="h-5 w-5 shrink-0 text-[var(--pre)]" strokeWidth={2.25} aria-hidden />
        {t("preorder.panel.title")}
      </p>
      <div className="mt-4">
        <Timeline stage={eta.stage} />
      </div>
      {expected && <p className="mt-4 font-display text-[16px] font-bold text-[var(--ink)]">{expected}</p>}
      {waitingCount != null && waitingCount > 0 && (
        <p className="mt-1 text-[14px] font-medium text-[var(--muted)]">{t("preorder.waiting", { n: waitingCount })}</p>
      )}
      {eta.note?.trim() && (
        <p className="mt-3 whitespace-pre-line text-[14px] font-medium leading-snug text-[#D4D4D8]">{eta.note.trim()}</p>
      )}
    </>
  );
}

/** My place in the queue with «Вийти з черги», or the button that puts the customer in the queue. */
function QueueAction({
  mine,
  hasEta,
  leaving,
  onLeave,
  onStart,
  t,
}: {
  mine: MyPreorder | null;
  hasEta: boolean;
  leaving: boolean;
  onLeave: () => void;
  onStart: () => void;
  t: TFn;
}) {
  if (!mine) {
    return (
      <Button
        variant="surface"
        size="lg"
        fullWidth
        className="!border-[var(--pre)] !bg-[var(--pre-soft)] !text-[var(--ink)] hover:!bg-[rgba(142,124,255,.22)]"
        icon={<Bell className="h-5 w-5 shrink-0" strokeWidth={2.25} />}
        onClick={onStart}
      >
        {hasEta ? t("preorder.cta") : t("preorder.ctaAny")}
      </Button>
    );
  }
  const queueLine = mine.position
    ? t("preorder.queue.in", { n: mine.position, q: mine.qty })
    : t("preorder.queue.inShort", { q: mine.qty });
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex min-w-0 items-center gap-2 font-display text-[15px] font-bold text-[var(--ink)]">
        <Check className="h-5 w-5 shrink-0 text-[var(--ok)]" strokeWidth={2.5} aria-hidden />
        <span className="min-w-0 [overflow-wrap:anywhere]">{queueLine}</span>
      </p>
      <button
        type="button"
        onClick={onLeave}
        disabled={leaving}
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-[var(--muted)] underline decoration-[var(--line-strong)] underline-offset-4 transition-colors hover:text-[var(--danger)] disabled:opacity-60"
      >
        {leaving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        {t("preorder.queue.leave")}
      </button>
    </div>
  );
}

export function PreorderPanel({
  productId,
  productTitle,
  variantId,
  variantName,
  eta,
  waitingCount,
  mine,
  holdHours = DEFAULT_HOLD_HOURS,
}: {
  productId: string;
  productTitle: string;
  variantId: string | null;
  variantName?: string | null;
  /** The open batch that brings this line; null = out of stock, no batch (plain notify button). */
  eta: PreorderEta | null;
  waitingCount: number | null;
  /** My live place in this line's queue. */
  mine: MyPreorder | null;
  /** How long a unit is held once it arrives, hours. */
  holdHours?: number;
}) {
  const { t, locale, href } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: productPreorderKey(productId) }),
      qc.invalidateQueries({ queryKey: MY_PREORDERS_KEY }),
    ]);
  }, [qc, productId]);

  function start() {
    if (status === "authed") {
      setOpen(true);
      return;
    }
    // guest (or still checking): sign in, then come back to this product
    router.push(href(`/login?next=${encodeURIComponent(pathname ?? href("/"))}`));
  }

  async function leave() {
    if (!mine || leaving) return;
    setLeaving(true);
    try {
      await preorderApi.leave(mine.id);
      await refresh();
      toast.success(t("preorder.queue.left"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("preorder.error.generic"));
    } finally {
      setLeaving(false);
    }
  }

  const expected = eta ? expectedLine(eta, t, locale) : null;

  return (
    <>
      <div
        className={`mt-6 rounded-[var(--r-card)] border p-4 sm:p-5 ${
          eta ? "border-[color-mix(in_srgb,var(--pre)_45%,transparent)] bg-[var(--pre-soft)]" : "border-[var(--line)] bg-[var(--surface)]"
        }`}
      >
        {eta && <EtaInfo eta={eta} expected={expected} waitingCount={waitingCount} t={t} />}
        <div className={eta ? "mt-4" : ""}>
          <QueueAction mine={mine} hasEta={!!eta} leaving={leaving} onLeave={() => void leave()} onStart={start} t={t} />
        </div>
        {!mine && <p className="mt-3 text-[12px] font-medium leading-snug text-[var(--muted)]">{eta ? t("preorder.noPrepay", { h: holdHours }) : t("preorder.noPrepayAny")}</p>}
      </div>

      <PreorderSheet
        open={open}
        onClose={() => setOpen(false)}
        title={productTitle}
        variantName={variantName ?? null}
        coming={!!eta}
        holdHours={holdHours}
        onSubmit={async (qty) => {
          await preorderApi.subscribe(productId, variantId, qty);
          await refresh();
          toast.success(t("preorder.queue.joined"));
        }}
      />
    </>
  );
}

/** Bottom sheet on phones, centred window on desktop: quantity + «Стати в чергу». */
function PreorderSheet({
  open,
  onClose,
  title,
  variantName,
  coming,
  holdHours,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variantName: string | null;
  coming: boolean;
  holdHours: number;
  onSubmit: (qty: number) => Promise<void>;
}) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return createPortal(
    <AnimatePresence>{open && <SheetBody key="sheet" onClose={onClose} title={title} variantName={variantName} coming={coming} holdHours={holdHours} onSubmit={onSubmit} />}</AnimatePresence>,
    document.body
  );
}

function SheetBody({
  onClose,
  title,
  variantName,
  coming,
  holdHours,
  onSubmit,
}: {
  onClose: () => void;
  title: string;
  variantName: string | null;
  coming: boolean;
  holdHours: number;
  onSubmit: (qty: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const limits = useOrderLimits();
  const cap = limits && limits.maxQtyPerProduct > 0 ? limits.maxQtyPerProduct : 10;
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useScrollLock(true);
  useEscape(true, close);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(qty);
      onClose();
    } catch (e) {
      const code = preorderErrorCode(e);
      // IN_STOCK / TOO_MANY come with a message the server already wrote in the customer's language
      setErr(e instanceof Error && (code || e.message) ? e.message : t("preorder.error.generic"));
      setBusy(false);
    }
  }

  return (
    <>
      <motion.div
        {...noFadeFlash}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-[6px]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pre-sheet-title"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 38 }}
          className="pointer-events-auto w-full max-w-[460px] rounded-t-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--bg)] p-5 pb-[calc(1.25rem+var(--safe-bottom))] shadow-[0_-24px_60px_-20px_rgba(0,0,0,.8)] sm:rounded-[var(--r-card)] sm:pb-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="pre-sheet-title" className="font-display text-[20px] font-extrabold uppercase tracking-[.02em] text-[var(--ink)]">
                {t("preorder.sheet.title")}
              </h2>
              <p className="mt-1 line-clamp-2 text-[14px] font-medium text-[var(--muted)]">
                {title}
                {variantName ? ` · ${variantName}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("common.close")}
              className="tap grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="eyebrow text-[11px]">{t("preorder.sheet.qty")}</span>
            <QtyStepper decreaseLabel={t("qty.decrease")} increaseLabel={t("qty.increase")} value={qty} onChange={setQty} min={1} max={cap} />
          </div>

          <p className="mt-4 flex items-start gap-2 text-[13px] font-medium leading-snug text-[var(--muted)]">
            <Send className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pre)]" strokeWidth={2.25} aria-hidden />
            {coming ? t("preorder.sheet.telegram", { h: holdHours }) : t("preorder.sheet.telegramAny")}
          </p>
          <p className="mt-2 text-[12px] font-medium leading-snug text-[var(--faint)]">
            {t("preorder.sheet.botHint")}{" "}
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--ink)] underline underline-offset-2">
              {t("preorder.sheet.bot")}
            </a>
          </p>

          {err && (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-[var(--danger)]">
              {err}
            </p>
          )}

          <Button variant="accent" size="lg" fullWidth loading={busy} className="mt-5" onClick={() => void submit()}>
            {t("preorder.sheet.submit")}
          </Button>
        </motion.div>
      </div>
    </>
  );
}
