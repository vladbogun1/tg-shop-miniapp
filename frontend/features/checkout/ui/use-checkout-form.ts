"use client";

import { useEffect, useRef, useState } from "react";
import { useLatest } from "@shop/ui/use-latest";
import { resolveNpWarehouse } from "@shop/core/np-geo";
import { useNpSelection } from "@shop/customer/delivery/np-selection";
import { customerApi, type DeliveryMethod } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import type { NpMode } from "../model/np-label";
import { useLastOrderQuery } from "../queries";

/**
 * Steps 1–2 state: contacts, delivery method, the branch (by text or on the map), the comment and
 * the prefill from the last order. Lives above the steps, not in them, so it survives going to the
 * next step and back.
 */
export function useCheckoutForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Nova Poshta is picked by text (city → branch fields) by default, or on the map; both modes edit
  // the same city / branch, so a pick in one shows in the other.
  const [delivery, setDelivery] = useState<DeliveryMethod>("NOVA_POSHTA");
  const [npMode, setNpMode] = useState<NpMode>("text");
  const [comment, setComment] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  // City, branch, map focus, "branch from the last order" — @shop/customer/delivery/np-selection.
  const np = useNpSelection(customerApi.checkout);
  /** The customer has touched the delivery choice — the last-order prefill backs off. */
  const touchedNp = np.touched;

  function chooseDelivery(d: DeliveryMethod) {
    touchedNp.current = true;
    setDelivery(d);
  }

  // ---- prefill from the last order (same source as the website: /api/me/orders) ----------------
  const token = useAccessToken();
  const lastOrder = useLastOrderQuery(!!token);
  const prefillDone = useRef(false);
  const npRef = useLatest(np);
  useEffect(() => {
    const o = lastOrder.data;
    const live = npRef.current;
    if (!o || prefillDone.current) return;
    prefillDone.current = true;
    let used = false;
    if (o.customerName) {
      setName((v) => v || o.customerName);
      used = true;
    }
    if (o.phone) {
      setPhone((v) => v || o.phone);
      used = true;
    }
    if (used) setPrefilled(true);
    if (touchedNp.current) return;
    if (o.deliveryMethod === "PICKUP") {
      setDelivery("PICKUP");
      return;
    }
    if (o.npCityName && o.npWarehouseName) {
      resolveNpWarehouse(o.npCityName, o.npWarehouseName, {
        cities: (q) => customerApi.checkout.npCities(q),
        warehouses: live.fetchWarehouses,
      })
        .then((found) => {
          // ...unless the customer has already started picking by hand.
          if (!found || touchedNp.current) return;
          live.applyLast(found, true);
        })
        .catch(() => {
          /* not critical: the customer picks again */
        });
    }
  }, [lastOrder.data, npRef, touchedNp]);

  return { name, setName, phone, setPhone, delivery, chooseDelivery, npMode, setNpMode, comment, setComment, prefilled, np };
}
