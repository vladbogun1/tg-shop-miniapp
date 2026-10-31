"use client";

/**
 * ORDER DETAIL (design doc §6ter.2 customer view): items, delivery, payment,
 * status timeline, tracking, online payment (monobank, ./OrderPayment).
 * Open-chat CTA «Написать в чат».
 * GET /api/me/orders/{id} (queryKey orderKeys.detail(id)).
 *
 * ChiSetup (v3): a sticky translucent header (back + title + status), stacked `.nb` sections
 * (status + StatusTimeline, items with thumbnails, totals, delivery, payment + tracking, reject
 * banner, the payment block) and a prominent sticky bottom "Написать в чат" button.
 * `?created=1` (from checkout) turns the payment block into the "order created" step; cancelling
 * follows the shared `customerCancelMode` (unpaid → at once, paid → a request, shipped → chat).
 */
import { orderKeys } from "@shop/customer/order/keys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, WifiOff } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button, StatusChip } from "@shop/ui/primitives";
import { customerApi } from "@/lib/api";
import { shortOrderId } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useT } from "@/i18n/context";
import { useAccessToken } from "@/lib/auth";
import { haptic } from "@/platform/telegram";
import { OrderBody } from "./OrderBody";

export function OrderScreen() {
  const t = useT();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const token = useAccessToken();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => customerApi.getOrder(id),
    // Wait for the Telegram sign-in to produce a token: firing this on mount raced the
    // initData exchange and the 403 that came back was shown as "не удалось загрузить".
    enabled: !!id && !!token,
  });

  return (
    <div className="pt-2">
      {/* sticky header */}
      <header
        className="sticky z-20 -mx-4 mb-4 flex items-center gap-2 border-b border-[var(--line)] px-4 py-3 backdrop-blur-[12px]"
        style={{ top: "var(--safe-top)", background: "rgba(14,14,16,.86)" }}
      >
        <button
          type="button"
          aria-label={t("common.back")}
          onClick={() => {
            haptic();
            router.push("/account");
          }}
          className="tap nb-press -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
        </button>
        <h1 className="nb-up flex-1 truncate text-[18px] font-extrabold text-[var(--ink)]">
          {t("inbox.orderNumber", { id: shortOrderId(id) })}
        </h1>
        {data && <StatusChip status={data.status} label={t(`status.${data.status}`)} />}
      </header>

      {(isLoading || !token) && (
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-32 rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {isError && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="nb hud-frame flex flex-col items-center gap-3 px-6 py-12 text-center"
        >
          <WifiOff className="h-8 w-8 text-[var(--accent)]" strokeWidth={2.25} />
          <p className="text-[14px] text-[var(--muted)]">
            {t("order.error")}
          </p>
          <Button
            variant="accent"
            loading={isRefetching}
            onClick={() => {
              haptic();
              void refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        </motion.div>
      )}

      {data && (
        <OrderBody
          order={data}
          id={id}
          onRefetch={() => void refetch()}
          onOrder={(o) => queryClient.setQueryData(orderKeys.detail(id), o)}
        />
      )}
    </div>
  );
}
