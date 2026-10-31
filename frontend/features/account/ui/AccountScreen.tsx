"use client";

import { useQuery } from "@tanstack/react-query";
import { orderKeys } from "@shop/customer/order/keys";
import { Logo } from "@/shell/Logo";
import { NotificationsBell } from "@/features/notifications";
import { SupportEntry } from "@/features/account/ui/SupportEntry";
import { LanguageSegments } from "@/shell/LanguageToggle";
import { AccountPreordersLink } from "@/features/preorders";
import { AccountReviewsLink } from "@/features/reviews";
import { useT } from "@/i18n/context";
import { customerApi } from "@/lib/api";
import { useAccessToken } from "@/lib/auth";
import { OrdersList } from "./OrdersList";
import { ProfileCard } from "./ProfileCard";

/** The account tab: profile, language, links to pre-orders / reviews / support, my orders. */
export function AccountScreen() {
  const t = useT();
  const token = useAccessToken();
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: orderKeys.list(),
    queryFn: () => customerApi.getOrders(),
    // Wait for the Telegram sign-in to produce a token: firing this on mount raced the
    // initData exchange and the 403 that came back was shown as "не удалось загрузить".
    enabled: !!token,
  });
  // A query disabled while the token is still on its way is "pending, not fetching", so the
  // screen would flash its empty state before the first request even goes out.
  const loading = isLoading || !token;
  const orders = data ?? [];

  return (
    <div className="pt-2">
      <header className="mb-4 flex items-start justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="nb-up text-[26px] font-extrabold text-[var(--ink)]">{t("account.title")}</h1>
          <p className="text-[13px] text-[var(--muted)]">{t("account.subtitle")}</p>
        </div>
        <NotificationsBell />
      </header>

      <ProfileCard ordersCount={orders.length} />

      <div className="mb-5">
        <LanguageSegments />
      </div>

      <AccountPreordersLink />

      <AccountReviewsLink />

      <SupportEntry />

      <h2 className="eyebrow mb-3 px-0.5">{t("account.myOrders")}</h2>

      <OrdersList
        orders={orders}
        loading={loading}
        isError={isError}
        isRefetching={isRefetching}
        onRetry={() => void refetch()}
      />

      {/* Brand sign-off: the same wordmark as the website, quietly closing the screen. */}
      <footer className="mt-10 flex flex-col items-center gap-2 pb-2" aria-label="ChiSetup">
        <Logo size="sm" variant="full" />
        <span className="mt-1 text-[11px] font-medium tracking-[0.04em] text-[var(--faint)]">chisetup.com.ua</span>
      </footer>
    </div>
  );
}
