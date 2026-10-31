"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customerApi, type OrderDetail } from "@/lib/api";
import { checkoutKeys } from "./keys";

/**
 * The last order — source of the name / phone / branch prefill (same source as the website:
 * /api/me/orders). Waits for the Telegram sign-in: fired before the token, /api/me/orders answers
 * 401 and the prefill is lost for this visit (same race the account page guards against).
 */
export function useLastOrderQuery(signedIn: boolean) {
  return useQuery({
    queryKey: checkoutKeys.lastOrder,
    staleTime: Infinity,
    retry: false,
    enabled: signedIn,
    queryFn: async (): Promise<OrderDetail | null> => {
      const list = await customerApi.getOrders();
      const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return latest ? customerApi.getOrder(latest.id) : null;
    },
  });
}

export function usePaymentOptionsQuery() {
  return useQuery({
    queryKey: checkoutKeys.paymentOptions,
    queryFn: () => customerApi.checkout.paymentOptions(),
  });
}

/** After an order is placed everything under "me" (orders list, cart…) is stale. */
export function useInvalidateMe() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: checkoutKeys.me });
}
