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
 * The list stays mounted (hidden) while «Аналитика» is open and under the drawers, so the loaded
 * «Показать ещё» portions, the search, the filter and the scroll position survive.
 *
 * The list stays mounted (hidden) while «Аналитика» is open and under the drawers, so the loaded
 * «Показать ещё» portions, the search, the filter and the scroll position survive.
 *
 * The OrderDrawer itself comes from the page (`renderOrderDrawer`): it opens the customer profile
 * in turn, and a direct import would close a cycle customer → orders → customer. So does «Новый заказ»
 * from the profile (`renderNewOrder`): the order window is the orders feature's; the created order opens on top.
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

export interface NewOrderSlot {
  open: boolean;
  user: UserCardDto | null;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}

export function UsersScreen({
  renderOrderDrawer,
  renderNewOrder,
  onWrite,
}: {
  renderOrderDrawer: (orderId: string | null, onClose: () => void) => ReactNode;
  /** «Новый заказ» в профиле: окно ручного заказа с этим покупателем. */
  renderNewOrder?: (slot: NewOrderSlot) => ReactNode;
  /** «Написать» в профиле (окно нового вопроса поддержки рисует страница: из клиентов в поддержку импорта нет). */
  onWrite?: (user: UserCardDto) => void;
}) {
  const [range, setRange] = useTimeRange();
  const [tab, setTab] = useState<Tab>("list");
  const [profileUser, setProfileUser] = useState<UserCardDto | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  // The buyer stays while the window closes (its exit animation still shows their name).
  const [newFor, setNewFor] = useState<UserCardDto | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="min-w-0">
      <PageHeader title="Покупатели" subtitle="Пользователи бота, их заказы и аналитика" />

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

      <div hidden={tab !== "list"}>
        <UsersTable onOpenUser={setProfileUser} />
      </div>
      {tab === "analytics" && <UserMetrics range={range} onOpenUser={setProfileUser} />}

      <UserProfileDrawer
        user={profileUser}
        onClose={() => setProfileUser(null)}
        onOpenOrder={setOpenOrderId}
        onWrite={onWrite}
        onNewOrder={
          renderNewOrder
            ? (u) => {
                setNewFor(u);
                setNewOpen(true);
              }
            : undefined
        }
      />
      {renderNewOrder?.({ open: newOpen, user: newFor, onClose: () => setNewOpen(false), onCreated: setOpenOrderId })}
      {/* Mounted after the profile drawer, so it stacks above it (same z-index, later in the DOM). */}
      {renderOrderDrawer(openOrderId, () => setOpenOrderId(null))}
    </div>
  );
}
