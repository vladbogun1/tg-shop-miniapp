"use client";

import { siteApi, siteKeys } from "@/features/site";
import { useApiMutation } from "@shop/ui/mutation";
import { toast } from "@shop/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inboxKeys } from "../keys";
import { goingBackOf, type GoingBack } from "../model/inbox";
import type { InboxItem } from "../model/types";

export interface OpenOrder {
  id: string;
  tab: "details" | "chat";
  payment: boolean;
  /** «Посылки» → «Едет назад»: the drawer opens «Отклонить» filled in. */
  back?: GoingBack;
}

/**
 * Main action of a row: open the order in the drawer (payment rows on the «Онлайн-оплата» block, chat rows
 * in the chat), jump to a product / reviews / support thread / supply draft, or retry the site rebuild.
 */
export function useInboxPrimary() {
  const qc = useQueryClient();
  const router = useRouter();
  const [order, setOrder] = useState<OpenOrder | null>(null);

  const refetchSite = () => {
    void qc.invalidateQueries({ queryKey: inboxKeys.all() });
    void qc.invalidateQueries({ queryKey: siteKeys.status() });
  };
  const retrySite = useApiMutation({
    mutationFn: () => siteApi.revalidate(),
    errorFallback: "Не удалось обновить сайт",
    onSuccess: (res) => {
      if (res.ok) toast.success("Сайт обновлён");
      else toast.error(`Сайт снова не обновился: ${res.error ?? "ошибка"}`);
      refetchSite();
    },
    onError: refetchSite,
  });

  function primary(item: InboxItem) {
    const orderId = item.orderId;
    switch (item.type) {
      case "PAYMENT":
      case "APPROVED_UNPAID":
        // Both open the order on its payment block.
        if (orderId) setOrder({ id: orderId, tab: "details", payment: true });
        break;
      case "CHAT":
        if (orderId) setOrder({ id: orderId, tab: "chat", payment: false });
        break;
      case "LOW_STOCK":
        if (item.productId) router.push(`/products?edit=${item.productId}`);
        break;
      case "SITE_ERROR":
        retrySite.mutate();
        break;
      case "REVIEW":
        router.push("/reviews?status=PENDING");
        break;
      case "NP_SYSTEM":
        router.push("/settings/delivery");
        break;
      case "SUPPORT":
        // A support thread, not an order: entityId is the thread id.
        router.push(`/support?thread=${encodeURIComponent(item.entityId)}`);
        break;
      case "SUPPLY_DRAFT":
        router.push(`/preorders/drafts/${encodeURIComponent(item.entityId)}`);
        break;
      default:
        // «Посылки»: a parcel coming back opens «Отклонить» filled in (goingBackOf), the rest just the order.
        if (orderId) setOrder({ id: orderId, tab: "details", payment: false, back: goingBackOf(item) });
    }
  }

  return { order, closeOrder: () => setOrder(null), primary, siteBusy: retrySite.isPending };
}
