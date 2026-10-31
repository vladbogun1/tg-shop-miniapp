"use client";

/**
 * «Журнал → Бот и сайт» — что бот отправил и дошло ли, что покупатели делали на сайте и в Mini App,
 * оплаты (monobank) и фоновые задачи. «Лента событий» — все события, «Рассылки» — итоги рассылок.
 * Данные: GET /api/admin/activity (+ /facets, /stats, /broadcasts) — activity_log, V47.
 *
 * Экран журнала получает эту вкладку СНАРУЖИ (app/audit/page.tsx → `AuditScreen botTab`): иначе цикл
 * staff → ActivityTab → OrderDrawer → staff.
 */
import { useState } from "react";
import { UserProfileDrawer } from "@/features/customer";
import { OrderDrawer } from "@/features/order";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Broadcasts } from "./Broadcasts";
import { Feed } from "./Feed";
import { StatsStrip } from "./StatsStrip";
import { useRowActions, type CustomerFilter } from "./use-row-actions";

type View = "feed" | "broadcasts";

export function ActivityTab() {
  const [view, setView] = useState<View>("feed");
  const [customer, setCustomer] = useState<CustomerFilter | null>(null);
  const [source, setSource] = useState("");
  const [result, setResult] = useState("");
  // Lifted here: a source picked on a stats card must drop an event of another source, else the
  // filter is source=SITE&type=<bot event> — always empty.
  const [type, setType] = useState("");
  const rows = useRowActions((c) => {
    setCustomer(c);
    setView("feed");
  });

  return (
    <div className="min-w-0">
      <StatsStrip
        active={source}
        onPick={(s, failedOnly) => {
          setView("feed");
          setSource(s === source && !failedOnly ? "" : s);
          setType("");
          setResult(failedOnly ? "FAILED" : "");
        }}
      />

      <div className="mb-4 mt-1">
        <SegmentedControl<View>
          size="sm"
          options={[
            { value: "feed", label: "Лента событий" },
            { value: "broadcasts", label: "Рассылки" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      {view === "feed" ? (
        <Feed
          shared={{ source, setSource, type, setType, result, setResult, customer, clearCustomer: () => setCustomer(null) }}
          actions={rows.actions}
        />
      ) : (
        <Broadcasts actions={rows.actions} />
      )}

      <UserProfileDrawer user={rows.profile} onClose={rows.closeProfile} onOpenOrder={rows.openOrder} />
      {/* After the profile drawer so it stacks above it. */}
      <OrderDrawer orderId={rows.openOrderId} onClose={rows.closeOrder} />
    </div>
  );
}
