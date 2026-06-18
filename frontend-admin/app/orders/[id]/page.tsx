"use client";

/**
 * /orders/{id} — deep-link target used by bot notifications
 * (ADMIN_BASE_URL + "/orders/" + id, docs/SPEC.md §бот). Opens the order detail
 * drawer directly over an empty board backdrop.
 */
import { useParams, useRouter } from "next/navigation";
import { OrderDrawer } from "@/components/orders/OrderDrawer";

export default function OrderDeepLinkPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;

  return (
    <div>
      <p className="text-[14px] text-[var(--text-muted)]">Заказ открыт в панели.</p>
      <OrderDrawer orderId={id} onClose={() => router.push("/")} />
    </div>
  );
}
