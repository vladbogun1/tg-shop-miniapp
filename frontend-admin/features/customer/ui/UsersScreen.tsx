"use client";

/**
 * Пользователи — two tabs (R11):
 *  - «Список»: search first, then a sortable / paged table (GET /api/admin/users); on a phone,
 *    cards with a sort select. Language = the one chosen in the shop (users.locale).
 *  - «Аналитика»: KPI cards + charts (GET /api/admin/users/metrics); the period switch lives
 *    here only — it never filtered the table, which read as a broken filter (D7). On top: the
 *    users map (IP → city) with "online now" (UsersMapBlock, GET /api/admin/users/geo*).
 * A row opens the UserProfileDrawer; an order in it opens the OrderDrawer ON TOP, so closing it
 * returns to the profile and the list with its search and page intact.
 *
 * The OrderDrawer itself comes from the page (`renderOrderDrawer`): it opens the customer profile
 * in turn, and a direct import would close a cycle customer → orders → customer.
 */
import type { TimeRange } from "@shop/core/types";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useTimeRange, RANGE_OPTIONS } from "@/lib/range";
import type { UserCardDto } from "../model/types";
import { UsersTable } from "./list/UsersTable";
import { UserMetrics } from "./metrics/UserMetrics";
import { UserProfileDrawer } from "./profile/UserProfileDrawer";

type Tab = "list" | "analytics";

export function UsersScreen({
  renderOrderDrawer,
}: {
  renderOrderDrawer: (orderId: string | null, onClose: () => void) => ReactNode;
}) {
  const [range, setRange] = useTimeRange();
  const [tab, setTab] = useState<Tab>("list");
  const [profileUser, setProfileUser] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  return (
    <div className="min-w-0">
      <PageHeader title="Пользователи" subtitle="Пользователи бота, их заказы и аналитика" />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Tab>
          options={[
            { value: "list", label: "Список" },
            { value: "analytics", label: "Аналитика" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "analytics" && (
          <SegmentedControl<TimeRange> options={RANGE_OPTIONS} value={range} onChange={setRange} size="sm" />
        )}
      </div>

      {tab === "list" ? (
        <UsersTable onOpenUser={setProfileUser} />
      ) : (
        <UserMetrics range={range} onOpenUser={setProfileUser} />
      )}

      <UserProfileDrawer user={profileUser} onClose={() => setProfileUser(null)} onOpenOrder={setOpenOrderId} />
      {/* Mounted after the profile drawer, so it stacks above it (same z-index, later in the DOM). */}
      {renderOrderDrawer(openOrderId, () => setOpenOrderId(null))}
    </div>
  );
}
