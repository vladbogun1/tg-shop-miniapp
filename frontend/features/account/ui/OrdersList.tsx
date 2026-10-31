"use client";

import { PackageOpen, WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@shop/ui/primitives";
import { useT } from "@/i18n/context";
import type { OrderSummary } from "@/lib/api";
import { haptic } from "@/platform/telegram";
import { EmptyState } from "./EmptyState";
import { OrderCard } from "./OrderCard";

/** The "my orders" block: skeleton, error with retry, empty state, or the cards. */
export function OrdersList({
  orders,
  loading,
  isError,
  isRefetching,
  onRetry,
}: {
  orders: OrderSummary[];
  loading: boolean;
  isError: boolean;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  const ready = !loading && !isError;
  return (
    <>
      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-[104px] rounded-[var(--r-card)]" />
          ))}
        </div>
      )}

      {isError && (
        <EmptyState
          icon={<WifiOff className="h-8 w-8" strokeWidth={2.5} />}
          title={t("account.error.title")}
          text={t("account.error.text")}
        >
          <Button
            variant="accent"
            loading={isRefetching}
            onClick={() => {
              haptic();
              onRetry();
            }}
          >
            {t("common.retry")}
          </Button>
        </EmptyState>
      )}

      {ready && orders.length === 0 && (
        <EmptyState
          icon={<PackageOpen className="h-8 w-8" strokeWidth={2.5} />}
          title={t("account.empty.title")}
          text={t("account.empty.text")}
        >
          <Link href="/" onClick={() => haptic()}>
            <Button variant="accent">{t("common.toCatalog")}</Button>
          </Link>
        </EmptyState>
      )}

      {ready && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((o, i) => (
            <OrderCard key={o.id} order={o} index={i} />
          ))}
        </div>
      )}
    </>
  );
}
