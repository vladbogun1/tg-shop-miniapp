"use client";

/**
 * /orders/{id} — deep-link target used by bot notifications and the notifications
 * inbox (ADMIN_BASE_URL + "/orders/" + id). Opens the order card directly; under it the
 * orders board is rendered (not an empty page with a caption), so closing the card lands on the
 * same board the admin would see at "/". ?tab=chat opens straight into the chat.
 */
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { OrderDrawer } from "./drawer/OrderDrawer";
import { OrdersScreen } from "./OrdersScreen";

export function OrderDeepLinkScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id ?? null;
  const initialTab = searchParams.get("tab") === "chat" ? "chat" : "details";

  return (
    <>
      <OrdersScreen />
      <OrderDrawer orderId={id} initialTab={initialTab} closeNavigates onClose={() => router.push("/")} />
    </>
  );
}
