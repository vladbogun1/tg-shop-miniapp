"use client";

import { Globe } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

/** Where an order was placed (backend `orders.source`). */
type OrderSource = "MINIAPP" | "WEB" | "ADMIN";

/** "Сайт" marker for orders placed on the public website (Mini App orders show nothing). */
export function SourceBadge({ source, className }: { source?: OrderSource | null; className?: string }) {
  if (source !== "WEB") return null;
  return (
    <Badge tone="info" className={className}>
      <Globe className="h-3 w-3" />
      Сайт
    </Badge>
  );
}
