"use client";

import { OrderDrawer } from "@/features/order";
import { UsersScreen } from "@/features/customer";

export default function UsersPage() {
  return <UsersScreen renderOrderDrawer={(orderId, onClose) => <OrderDrawer orderId={orderId} onClose={onClose} />} />;
}
