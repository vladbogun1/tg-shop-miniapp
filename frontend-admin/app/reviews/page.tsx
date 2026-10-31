"use client";

import { OrderDrawer } from "@/features/order";
import { ReviewsScreen } from "@/features/review";

export default function ReviewsPage() {
  return <ReviewsScreen renderOrderDrawer={(orderId, onClose) => <OrderDrawer orderId={orderId} onClose={onClose} />} />;
}
