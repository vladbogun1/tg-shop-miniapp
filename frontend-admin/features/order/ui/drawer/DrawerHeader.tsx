"use client";

import { Badge, StatusBadge } from "@/components/ui/Badge";
import { PaymentBadge } from "@/features/payment";
import { ReturnBadge } from "@/features/returns";
import type { AdminOrderDetail } from "../../api";
import { shortId } from "../../model/status";
import { SourceBadge } from "../board/SourceBadge";

/** Short id + status/payment/source badges (they wrap — the × must stay on a phone screen). */
export function DrawerHeader({ order, archived }: { order: AdminOrderDetail | undefined; archived: boolean }) {
  return (
    <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 pointer-coarse:min-h-11">
      <span className="font-display tabular mr-0.5 text-[17px] font-bold leading-none tracking-[0.02em] text-[var(--ink)]">
        {order ? shortId(order.id) : "Заказ"}
      </span>
      {order && (
        <>
          <StatusBadge status={order.status} />
          <PaymentBadge order={order} />
          <SourceBadge source={order.source} />
          <ReturnBadge status={order.admin?.returnStatus} />
        </>
      )}
      {archived && <Badge>В архиве</Badge>}
    </div>
  );
}
