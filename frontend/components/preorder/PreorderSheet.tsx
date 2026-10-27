"use client";

/**
 * Bottom sheet «Повідомити про надходження»: quantity, a note that the bot writes, «Стати в чергу».
 * Opened from the catalog card, the product page and the account screen. For a place the customer
 * already has it changes the quantity («Зберегти») and offers «Вийти з черги».
 * POST /api/me/preorders again = change of quantity; 400 + code IN_STOCK means it is on sale after all.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useI18n } from "@/i18n/context";
import { ApiError, type Product, type ProductVariant } from "@/lib/api";
import { useOrderLimits } from "@/lib/order-limits";
import { preorderApi, preorderKeys, QUEUE_MAX_QTY, type MyPreorder } from "@/lib/preorders";
import { backdrop, sheetVariants } from "@/lib/motion";
import { haptic } from "@/lib/telegram";

export function PreorderSheet({
  product,
  variant,
  mine,
  open,
  onClose,
  onDone,
}: {
  product: Product | null;
  variant: ProductVariant | null;
  /** My existing place in this queue, if any. */
  mine?: MyPreorder;
  open: boolean;
  onClose: () => void;
  /** Called with the toast text after a change went through. */
  onDone?: (message: string) => void;
}) {
  // In a portal: opened from the product view (its own z-70 layer) the sheet must still cover the tab bar.
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && product && (
        <Body key={`${product.id}:${variant?.id ?? ""}`} product={product} variant={variant} mine={mine} onClose={onClose} onDone={onDone} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Body({
  product,
  variant,
  mine,
  onClose,
  onDone,
}: {
  product: Product;
  variant: ProductVariant | null;
  mine?: MyPreorder;
  onClose: () => void;
  onDone?: (message: string) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const limits = useOrderLimits();
  const cap = limits && limits.maxQtyPerProduct > 0 ? Math.min(limits.maxQtyPerProduct, QUEUE_MAX_QTY) : QUEUE_MAX_QTY;
  const [qty, setQty] = useState(Math.min(Math.max(mine?.qty ?? 1, 1), cap));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: preorderKeys.mine });
    void qc.invalidateQueries({ queryKey: ["preorders", "product"] });
  };

  const join = useMutation({
    mutationFn: () => preorderApi.subscribe(product.id, variant?.id ?? null, qty),
    onSuccess: () => {
      refresh();
      onDone?.(t("preorder.toast.joined"));
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "IN_STOCK") {
        setError(t("preorder.err.inStock"));
        void qc.invalidateQueries({ queryKey: ["products"] });
      } else {
        setError(e instanceof ApiError && e.message ? e.message : t("preorder.err.generic"));
      }
    },
  });

  const leave = useMutation({
    mutationFn: () => preorderApi.leave(mine!.id),
    onSuccess: () => {
      refresh();
      onDone?.(t("preorder.toast.left"));
      onClose();
    },
    onError: () => setError(t("preorder.err.generic")),
  });

  const title = variant ? `${product.title} · ${variant.name}` : product.title;
  const busy = join.isPending || leave.isPending;

  return (
    <motion.div
      variants={backdrop}
      initial="initial"
      animate="animate"
      exit="exit"
      onClick={onClose}
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/65"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t("preorder.sheet.title")}
        variants={sheetVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[16px] border border-b-0 border-[var(--line-strong)] bg-[var(--surface)]"
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-[var(--line-strong)]" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 pb-3 pt-1.5">
          <h2 className="font-display flex min-w-0 items-center gap-2 text-[15px] font-extrabold uppercase leading-tight tracking-[0.04em] text-[var(--ink)]">
            <Bell className="h-[18px] w-[18px] shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
            <span>{t("preorder.sheet.title")}</span>
          </h2>
          <button
            type="button"
            onClick={() => {
              haptic();
              onClose();
            }}
            aria-label={t("common.close")}
            className="tap -mr-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--muted)] active:scale-95"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="px-4 pb-4 pt-4" style={{ paddingBottom: "calc(16px + var(--safe-bottom))" }}>
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ink)]">{title}</p>

          <p className="eyebrow mb-2 mt-4 !tracking-[0.2em]">{t("preorder.sheet.qty")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <QtyStepper value={qty} onChange={setQty} min={1} max={cap} />
            <span className="text-[12px] text-[var(--faint)]">{t("preorder.sheet.max", { n: cap })}</span>
          </div>

          <p className="mt-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] leading-snug text-[var(--muted)]">
            {t("preorder.sheet.bot")}
          </p>

          {error && (
            <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--danger)]">
              {error}
            </p>
          )}

          <Button
            variant="accent"
            fullWidth
            className="mt-4"
            loading={join.isPending}
            disabled={busy}
            onClick={() => {
              haptic();
              setError(null);
              join.mutate();
            }}
          >
            {mine ? t("preorder.sheet.save") : t("preorder.sheet.join")}
          </Button>
          {mine && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                haptic();
                setError(null);
                leave.mutate();
              }}
              className="tap mt-2 w-full py-2.5 text-center text-[13px] font-semibold text-[var(--muted)] underline underline-offset-2 disabled:opacity-50"
            >
              {t("preorder.leave")}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
