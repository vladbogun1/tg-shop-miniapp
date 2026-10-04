"use client";

/**
 * Promo code entry — copied from the Mini App (frontend/components/cart/PromoField.tsx). On the
 * website it lives on the checkout page (there is no separate cart step), with the same rules:
 * checked as typed, limited codes held for 30 min, only a VERIFIED code is ever sent with the order.
 *
 * Original notes:
 * Promo code entry for the cart.
 *
 * The code used to be typed here, accepted without a word, and only checked on the LAST checkout
 * step — which shows "invalid promo code" over a field that no longer exists, so the only way to
 * drop a bad code was to abandon the whole checkout and start again. It is now checked where it is
 * typed, the discount is shown against the real cart total, and it can be cleared with one tap.
 *
 * A code with a usage limit is also HELD for this customer for half an hour (the server side of
 * that is PromoService), so the discount promised here does not disappear between the cart and the
 * order. Clearing the field gives the hold back instead of sitting on it until it expires.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Loader2, Ticket, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/context";
import { api, isAuthFailure, type PromoPreview } from "@/lib/api";
import { useFmt } from "@/lib/use-fmt";

/** Long enough that a code is not checked on every keystroke, short enough to feel immediate. */
const DEBOUNCE_MS = 450;

export function PromoField({
  code,
  onChange,
  subtotal,
  currency,
  preview,
}: {
  code: string;
  onChange: (code: string) => void;
  subtotal: number;
  currency: string;
  /** Lifted so the cart totals show the same numbers this field reports. */
  preview: { data: PromoPreview | null; loading: boolean };
}) {
  const t = useT();
  const trimmed = code.trim();
  const state: "empty" | "checking" | "ok" | "bad" = !trimmed
    ? "empty"
    : preview.loading
      ? "checking"
      : preview.data?.valid
        ? "ok"
        : "bad";

  function clear() {
    // Hand the hold back right away; another customer may be waiting for the last use.
    if (trimmed) api.releasePromo(trimmed).catch(() => {});
    onChange("");
  }

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-2.5 transition-colors focus-within:border-[var(--accent)]"
        style={
          state === "bad"
            ? { borderColor: "var(--danger)" }
            : state === "ok"
              ? { borderColor: "var(--ok)" }
              : undefined
        }
      >
        <Ticket className="h-4 w-4 shrink-0 text-[var(--muted)]" strokeWidth={2.25} aria-hidden />
        <input
          value={code}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder={t("promo.placeholder")}
          aria-label={t("promo.placeholder")}
          aria-invalid={state === "bad"}
          className="min-h-[36px] w-full bg-transparent font-display text-[15px] font-semibold uppercase tracking-[.08em] text-[var(--ink)] outline-none placeholder:font-sans placeholder:font-normal placeholder:text-[var(--faint)] placeholder:normal-case placeholder:tracking-normal"
        />

        {state === "checking" && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--muted)]" strokeWidth={2.25} />
        )}
        {state === "ok" && (
          <Check className="h-5 w-5 shrink-0 text-[var(--ok)]" strokeWidth={2.5} />
        )}
        {trimmed.length > 0 && (
          <motion.button
            type="button"
            aria-label={t("promo.clear")}
            whileTap={{ scale: 0.88 }}
            onClick={clear}
            className="-mr-1 grid h-8 w-8 min-h-0 min-w-0 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-3)] text-[var(--ink)] transition-transform active:scale-[.96]"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </motion.button>
        )}
      </div>

      <PromoHint state={state} preview={preview.data} subtotal={subtotal} currency={currency} />
    </div>
  );
}

function PromoHint({
  state,
  preview,
  subtotal,
  currency,
}: {
  state: "empty" | "checking" | "ok" | "bad";
  preview: PromoPreview | null;
  subtotal: number;
  currency: string;
}) {
  const t = useT();
  const fmt = useFmt();
  if (state === "empty") {
    return (
      <p className="mt-1.5 px-1 text-[12px] font-medium text-[var(--faint)]">
        {t("promo.hint")}
      </p>
    );
  }
  if (state === "checking") {
    return (
      <p className="mt-1.5 px-1 text-[12px] font-medium text-[var(--muted)]">
        {t("promo.checking")}
      </p>
    );
  }
  if (state === "bad") {
    // The server already answers in the customer's language; the fallback is for a dropped request.
    return (
      <p className="mt-1.5 px-1 text-[12px] font-semibold text-[var(--danger)]">
        {preview?.message ?? t("promo.notFound")}
      </p>
    );
  }
  const discount = preview?.discountMinor ?? 0;
  return (
    <p className="mt-1.5 px-1 text-[12px] font-semibold text-[var(--ok)]">
      {t("promo.discount", {
        discount: fmt.money(discount, currency),
        subtotal: fmt.money(subtotal, currency),
      })}
      {preview?.reservedUntil ? t("promo.heldUntil", { time: fmt.time(preview.reservedUntil) }) : ""}
    </p>
  );
}

/**
 * Debounced check of the typed code against the current subtotal.
 *
 * Tries the authenticated endpoint first so a limited code is actually held; falls back to the
 * public preview when the Telegram sign-in has not finished yet (or the customer is browsing in a
 * plain browser), where the answer is still correct, just not reserved.
 */
export function usePromoPreview(code: string, subtotal: number) {
  const trimmed = code.trim();
  const [debounced, setDebounced] = useState(trimmed);
  const lastReserved = useRef<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [trimmed]);

  // Replacing one code with another must not leave the previous one held.
  useEffect(() => {
    const previous = lastReserved.current;
    if (previous && previous !== debounced) {
      api.releasePromo(previous).catch(() => {});
    }
    lastReserved.current = debounced || null;
  }, [debounced]);

  const query = useQuery({
    queryKey: ["promo", debounced, subtotal],
    enabled: debounced.length > 0 && subtotal > 0,
    // A hold is refreshed on every check, so a stale cached answer would quietly let it run out.
    staleTime: 30_000,
    queryFn: async () => {
      try {
        return await api.reservePromo(debounced, subtotal);
      } catch (e) {
        if (isAuthFailure(e)) {
          return api.previewPromo(debounced, subtotal);
        }
        throw e;
      }
    },
  });

  return {
    data: query.data ?? null,
    // While the debounce is still running the old answer must not be presented as the new one.
    loading: trimmed.length > 0 && (trimmed !== debounced || query.isFetching),
    discount: query.data?.valid ? query.data.discountMinor : 0,
  };
}
