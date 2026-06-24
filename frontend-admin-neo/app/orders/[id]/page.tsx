"use client";

/**
 * /orders/{id} — deep-link target used by bot notifications and the notifications
 * inbox (ADMIN_BASE_URL + "/orders/" + id). Opens the order detail drawer directly
 * over an empty board backdrop. ?tab=chat opens straight into the chat.
 */
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { OrderDrawer } from "@/components/orders/OrderDrawer";

export default function OrderDeepLinkPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params?.id ?? null;
  const initialTab = searchParams.get("tab") === "chat" ? "chat" : "details";

  return (
    <div>
      <p className="text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        Заказ открыт в панели.
      </p>
      <OrderDrawer
        orderId={id}
        initialTab={initialTab}
        onClose={() => router.push("/")}
      />
    </div>
  );
}
