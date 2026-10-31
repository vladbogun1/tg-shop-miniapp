"use client";

import { InboxScreen } from "@/features/inbox";
import { orderSlot } from "./order-slot";

export default function InboxPage() {
  return <InboxScreen order={orderSlot} />;
}
