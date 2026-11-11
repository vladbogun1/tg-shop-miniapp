"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest } from "@shop/ui/use-latest";
import { useDeliveryDraft } from "@shop/customer/delivery/use-delivery-draft";
import { useNpConfig } from "@shop/customer/delivery/use-np-delivery";
import { customerApi } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import type { NpMode } from "../model/np-label";
import { useLastOrderQuery } from "../queries";

/**
 * Steps 1–2 state: recipient (прізвище / ім'я / по батькові) and phone, the delivery tab (відділення · поштомат ·
 * кур'єр · самовивіз), the point (by text or on the map) or the courier address, the comment and the prefill from
 * the last order. Lives above the steps, not in them, so it survives going to the next step and back.
 * The delivery rules are shared with the site: @shop/customer/delivery/use-delivery-draft.
 */
export function useCheckoutForm() {
  const [phone, setPhone] = useState("");
  // A point is picked by text (city → point fields) by default, or on the map; both modes edit the same
  // city / point, so a pick in one shows in the other.
  const [npMode, setNpMode] = useState<NpMode>("text");
  const [comment, setComment] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const npConfig = useNpConfig(customerApi.checkout);
  const d = useDeliveryDraft(customerApi.checkout, npConfig.tabs);

  // ---- prefill from the last order (same source as the website: /api/me/orders) ----------------
  const token = useAccessToken();
  const lastOrder = useLastOrderQuery(!!token);
  const prefillDone = useRef(false);
  const draftRef = useLatest(d);
  useEffect(() => {
    const o = lastOrder.data;
    if (!o || prefillDone.current) return;
    prefillDone.current = true;
    if (o.phone) setPhone((v) => v || o.phone);
    if (o.phone || o.customerName) setPrefilled(true);
    // Tab, city and point by ref (the map is framed on the point), courier address; backs off once touched.
    draftRef.current.applyLastOrder(o, true);
  }, [lastOrder.data, draftRef]);

  return {
    d,
    tabs: npConfig.tabs,
    estimateEnabled: npConfig.estimateEnabled,
    phone,
    setPhone,
    npMode,
    setNpMode,
    comment,
    setComment,
    prefilled,
  };
}
