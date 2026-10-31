"use client";

/** «Едет назад» — отказная посылка едет обратно в магазин (admin.returnStatus = IN_TRANSIT). */
import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { ReturnStatus } from "../model/types";

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
