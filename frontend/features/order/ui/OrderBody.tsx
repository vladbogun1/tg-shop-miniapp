"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OrderReceipts } from "@/features/account";
import { OrderReviewsCard } from "@/features/reviews";
import { ORDER_PAY_ANCHOR, useOrderGiftCase } from "@/features/gift";
import { Button } from "@shop/ui/primitives";
import { customerCancelMode, paymentFirst, paymentState } from "@shop/core/orders";
import { hasOnlinePayment } from "@shop/core/receipts";
import { useT } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { riseItem, staggerContainer } from "@/lib/motion";
import { haptic } from "@/platform/telegram";
import { Cancellation } from "./Cancellation";
import { OrderInfoCard } from "./OrderInfoCard";
import { OrderItemsCard } from "./OrderItemsCard";
import { OrderPayment } from "./payment/OrderPayment";
import { OrderStatusCard } from "./OrderStatusCard";

/** The server sends the reject reason code with the order; the shared type does not list it yet. */
type OrderWithReasonCode = OrderDetail & { rejectReasonCode?: string | null };

export function OrderBody({
  order,
  id,
  onRefetch,
  onOrder,
}: {
  order: OrderDetail;
  id: string;
  onRefetch: () => void;
  onOrder: (o: OrderDetail) => void;
}) {
  const t = useT();
  const payState = paymentState(order);
  const cancelMode = customerCancelMode(order);
  const paymentTimeout =
    order.status === "REJECTED" &&
    (order as OrderWithReasonCode).rejectReasonCode === "PAYMENT_TIMEOUT";
  // `?created=1` (straight from checkout): the "order created — pay or cancel" step. Read once
  // from the address and dropped from it, so a reload shows the plain order page.
  const router = useRouter();
  const [created] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("created") === "1"
  );
  useEffect(() => {
    if (created) router.replace(`/account/orders/${id}`, { scroll: false });
  }, [created, router, id]);

  // Gift case (V57): the case card on top (locked until paid), the opening screen (once).
  const giftCase = useOrderGiftCase(order, created);

  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelRef = useRef<HTMLDivElement>(null);
  const openCancel = () => {
    setCancelOpen(true);
    window.setTimeout(() => cancelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  // While the order is fresh (NEW / APPROVED, or paid within the last day) the payment block and
  // its receipts lead the page: a customer who has just paid must see «Оплачено» without scrolling
  // past the timeline, items and recipient. Older orders keep it below the details.
  const payFirst = payState === "AWAITING" || paymentFirst(order);
  const receipts = hasOnlinePayment(order) ? <OrderReceipts order={order} /> : null;
  const payment = (
    <OrderPayment
      order={order}
      onOrder={onOrder}
      onRefetch={onRefetch}
      created={created}
      onCancel={cancelMode === "CANCEL" ? openCancel : undefined}
    />
  );

  return (
    <>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        // leave room for the sticky chat bar (button + safe area)
        className="flex flex-col gap-4 pb-28"
      >
        {giftCase.card && <motion.div variants={riseItem}>{giftCase.card}</motion.div>}

        {/* Payment due or just paid: the action / «Оплачено» goes first, receipts right under it. */}
        {payFirst && (
          <motion.div variants={riseItem} id={ORDER_PAY_ANCHOR} className="flex scroll-mt-4 flex-col gap-4">
            {payment}
            {receipts}
          </motion.div>
        )}
        <OrderStatusCard order={order} payState={payState} paymentTimeout={paymentTimeout} />

        {/* reviews (Phase C): delivered order → review form per line + bonus */}
        {order.status === "DELIVERED" && <OrderReviewsCard orderId={order.id} />}

        {/* items + totals */}
        <OrderItemsCard order={order} />

        {/* delivery + payment */}
        <OrderInfoCard order={order} />

        {/* paid: amount, card / Apple Pay, what is left for the courier */}
        {!payFirst && <motion.div variants={riseItem}>{payment}</motion.div>}

        {/* receipts: fiscal checks (sale / refunds) + the bank receipt, once money came in online */}
        {!payFirst && receipts}

        {/* cancel: unpaid → at once; paid → a request; shipped → the chat (shared customerCancelMode) */}
        {cancelMode !== "NONE" && (
          <motion.section variants={riseItem} ref={cancelRef}>
            <Cancellation
              order={order}
              mode={cancelMode}
              open={cancelOpen}
              setOpen={setCancelOpen}
              onDone={onRefetch}
            />
          </motion.section>
        )}
      </motion.div>

      {giftCase.overlay}

      {/* sticky chat CTA — within thumb reach, above the TabBar */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-[480px] px-4"
        style={{ bottom: "calc(var(--tabbar-h) + var(--safe-bottom))" }}
      >
        <Link
          href={`/account/orders/${id}/chat`}
          onClick={() => haptic()}
          className="block"
        >
          <Button
            variant="accent"
            fullWidth
            icon={<MessageCircle className="h-4 w-4" strokeWidth={2.5} />}
          >
            {t("order.openChat")}
          </Button>
        </Link>
      </div>
    </>
  );
}
