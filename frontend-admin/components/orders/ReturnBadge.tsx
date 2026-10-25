"use client";

/** «Едет назад» — a refused parcel is on its way back to the shop (admin.returnStatus = IN_TRANSIT). */
import { Undo2 } from "lucide-react";
import type { ReturnStatus } from "@/lib/orders-api";
import { Badge } from "@/components/ui/Badge";

export function ReturnBadge({
  status,
  className,
  icon = true,
}: {
  status?: ReturnStatus | null;
  className?: string;
  icon?: boolean;
}) {
  if (status !== "IN_TRANSIT") return null;
  return (
    <Badge tone="warn" className={className}>
      {icon && <Undo2 className="h-3 w-3" />}
      Едет назад
    </Badge>
  );
}
