"use client";

/** Checkout hooks: prefill from the last order, and the payment option the customer can pick. */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { type DeliveryMethod, type OrderDetail } from "@shop/core/types";
import { visiblePaymentOptions } from "@shop/core/orders";
import { giftProgress, guaranteedDiscountMinor, type GiftChoice } from "@shop/core/giftcase";
import { resolveNpWarehouse } from "@shop/core/np-geo";
import { type useNpSelection } from "@shop/customer/delivery/np-selection";
import { useI18n } from "@/i18n/context";
import { api } from "@/lib/api";
import { useGift } from "@/features/gift";
import { usePromoPreview } from "./ui/PromoField";

interface PrefillTargets {
  setName: (f: (v: string) => string) => void;
  setPhone: (f: (v: string) => string) => void;
  setDelivery: (d: DeliveryMethod) => void;
  setPrefilled: (v: boolean) => void;
}

/** Fills contacts and delivery from the customer's latest order, once, and never over their input. */
export function useLastOrderPrefill(np: ReturnType<typeof useNpSelection>, target: PrefillTargets) {
  const lastOrder = useQuery({
    queryKey: ["me", "last-order"],
    staleTime: Infinity,
    queryFn: async (): Promise<OrderDetail | null> => {
      const list = await api.orders();
      const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? api.order(latest.id) : null;
    },
  });
  /** The customer has touched the city / branch fields or the map — the last-order prefill backs off. */
  const touchedNp = np.touched;

  const prefillDone = useRef(false);
  useEffect(() => {
    const o = lastOrder.data;
    if (!o || prefillDone.current) return;
    prefillDone.current = true;
    let used = false;
    if (o.customerName) {
      target.setName((v) => v || o.customerName);
      used = true;
    }
    if (o.phone) {
      target.setPhone((v) => v || o.phone);
      used = true;
    }
    if (used) target.setPrefilled(true);
    if (o.deliveryMethod === "PICKUP") {
      target.setDelivery("PICKUP");
      return;
    }
    // The order keeps only names; find the branch again so it can be submitted with its refs.
    if (o.npCityName && o.npWarehouseName) {
      (async () => {
        try {
          const found = await resolveNpWarehouse(o.npCityName!, o.npWarehouseName!, {
            cities: (q) => api.checkout.npCities(q),
            warehouses: (ref) => api.checkout.npWarehouses(ref, ""),
          });
          // ...unless the customer has already started picking by hand.
          if (found && !touchedNp.current) {
            np.applyLast(found, false);
          }
        } catch {
          /* not critical: the customer picks on the map */
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per loaded order; `np` methods are not stable
  }, [lastOrder.data]);
}

/**
 * Payment options for `total` and the chosen one. A prepayment option is hidden when the whole order
 * costs no more than the prepayment. If it was picked and the total then dropped (promo, quantity),
 * the choice moves to the first full-payment option — derived so the summary never shows a hidden
 * option, synced into state. Every option is paid online through monobank acquiring: either the whole
 * order, or the prepayment now and the rest as cash on delivery; the server answers with the same
 * amountDueMinor, `dueNow` is for the button and the summary.
 */
export function usePaymentChoice(total: number) {
  const { locale } = useI18n();
  const query = useQuery({ queryKey: ["payment-options", locale], queryFn: () => api.checkout.paymentOptions() });
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const options = useMemo(() => visiblePaymentOptions(query.data ?? [], total), [query.data, total]);
  const chosen =
    options.find((p) => p.id === paymentId) ?? (paymentId ? options.find((p) => !p.requiresPrepayment) ?? null : null);
  const chosenId = chosen?.id ?? null;
  const optionsLoaded = !!query.data;
  useEffect(() => {
    if (optionsLoaded && chosenId !== paymentId) setPaymentId(chosenId);
  }, [optionsLoaded, chosenId, paymentId]);
  const dueNow = chosen?.requiresPrepayment && chosen.prepaymentMinor ? Math.min(chosen.prepaymentMinor, total) : total;
  const status: "loading" | "error" | "ready" = query.isLoading ? "loading" : query.isError ? "error" : "ready";
  return { status, options, chosen, chosenId, dueNow, choose: setPaymentId };
}

/**
 * Money of the order: the promo preview, the gift tier reached on the total after the promo (the case,
 * the default, or the tier's guaranteed discount — counted like the server does), and the final total.
 */
export function useCheckoutTotals(promoCode: string, subtotal: number) {
  const promo = usePromoPreview(promoCode, subtotal);
  const discount = promo.discount;
  const baseTotal = Math.max(0, subtotal - discount);
  const giftNow = giftProgress(useGift(), baseTotal);
  const gift = giftNow?.reached ? giftNow : null;
  const [giftChoice, setGiftChoice] = useState<GiftChoice>("CASE");
  const giftTier = gift?.kind === "CASE" ? gift.tier : null;
  const giftDiscount = giftChoice === "DISCOUNT" ? guaranteedDiscountMinor(giftTier, baseTotal) : 0;
  return {
    promo,
    promoValid: promo.data?.valid === true,
    discount,
    baseTotal,
    gift,
    giftTier,
    giftChoice,
    setGiftChoice,
    giftDiscount,
    total: baseTotal - giftDiscount,
  };
}
