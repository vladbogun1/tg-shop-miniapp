"use client";

/**
 * Bottom sheet «Повідомити про надходження»: quantity, a note that the bot writes, «Стати в чергу».
 * Opened from the catalog card, the product page and the account screen. For a place the customer
 * already has it changes the quantity («Зберегти») and offers «Вийти з черги».
 * POST /api/me/preorders again = change of quantity; 400 + code IN_STOCK means it is on sale after all.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, QtyStepper } from "@shop/ui/primitives";
import { useI18n } from "@/i18n/context";
import { ApiError, type Product, type ProductVariant } from "@/lib/api";
import { useOrderLimits } from "@/features/cart";
import { DEFAULT_HOLD_HOURS, preorderApi, preorderKeys, QUEUE_MAX_QTY, type MyPreorder } from "@/features/preorders/state";
import { Sheet } from "@shop/ui/overlay";
import { haptic, useBackButton } from "@/platform/telegram";

export function PreorderSheet({
  product,
  variant,
  mine,
  coming = false,
  holdHours = DEFAULT_HOLD_HOURS,
  open,
  onClose,
  onDone,
}: {
  product: Product | null;
  variant: ProductVariant | null;
  /** My existing place in this queue, if any. */
  mine?: MyPreorder;
  /** A batch is on its way («коли приїде»); false = sold out with nothing coming («коли з'явиться»). */
  coming?: boolean;
  /** Hold length once it arrives, hours. */
  holdHours?: number;
  open: boolean;
  onClose: () => void;
  /** Called with the toast text after a change went through. */
  onDone?: (message: string) => void;
}) {
  const { t } = useI18n();
  const shown = open && !!product;
  // Telegram's own «Назад» goes through history, so it lands in the sheet's «Назад закрывает» entry.
  useBackButton(shown, () => window.history.back());
  return (
    <Sheet
      open={shown}
      backClose="preorderSheet"
      onClose={onClose}
      title={
        <>
          <Bell className="h-[18px] w-[18px] shrink-0 text-[var(--accent)]" strokeWidth={2.5} />
          <span>{t("preorder.sheet.title")}</span>
        </>
      }
      closeLabel={t("common.close")}
      ariaLabel={t("preorder.sheet.title")}
      onCloseClick={haptic}
    >
      {product && (
        <Body key={`${product.id}:${variant?.id ?? ""}`} product={product} variant={variant} mine={mine} coming={coming} holdHours={holdHours} onClose={onClose} onDone={onDone} />
      )}
    </Sheet>
  );
}

function Body({
  product,
  variant,
  mine,
  coming,
  holdHours,
  onClose,
  onDone,
}: {
  product: Product;
  variant: ProductVariant | null;
  mine?: MyPreorder;
  coming: boolean;
  holdHours: number;
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
        <div className="px-4 pb-4 pt-4" style={{ paddingBottom: "calc(16px + var(--safe-bottom))" }}>
          <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-[var(--ink)]">{title}</p>

          <p className="eyebrow mb-2 mt-4 !tracking-[0.2em]">{t("preorder.sheet.qty")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <QtyStepper decreaseLabel={t("qty.decrease")} increaseLabel={t("qty.increase")} value={qty} onChange={setQty} min={1} max={cap} />
            <span className="text-[12px] text-[var(--faint)]">{t("preorder.sheet.max", { n: cap })}</span>
          </div>

          <p className="mt-4 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] leading-snug text-[var(--muted)]">
            {coming ? t("preorder.sheet.bot", { h: holdHours }) : t("preorder.sheet.botOut")}
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
  );
}
