import type { ReorderRow } from "../../../model/types";
import { StatusChip } from "../../kit";

export function editHref(productId: string) {
  return `/products?edit=${productId}`;
}

export function UrgencyChip({ row }: { row: Pick<ReorderRow, "daysToZero" | "urgency" | "stock"> }) {
  if (row.stock <= 0) return <StatusChip tone="danger">● закончился</StatusChip>;
  const days = row.daysToZero == null ? "—" : `${Math.round(row.daysToZero)} дн`;
  if (row.urgency === "critical") return <StatusChip tone="danger">● {days}</StatusChip>;
  if (row.urgency === "soon") return <StatusChip tone="warn">◐ {days}</StatusChip>;
  return <StatusChip tone="muted">○ {days}</StatusChip>;
}
