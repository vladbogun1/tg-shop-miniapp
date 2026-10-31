"use client";

import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { PromocodesScreen } from "@/features/promo";

export default function PromocodesPage() {
  return <PromocodesScreen renderOrderDrawer={(orderId, onClose) => <OrderDrawer orderId={orderId} onClose={onClose} />} />;
}
