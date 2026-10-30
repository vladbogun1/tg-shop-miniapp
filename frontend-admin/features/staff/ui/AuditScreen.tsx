"use client";

/**
 * Журнал (route "/audit"), две вкладки (?tab=):
 *  - «Админка» — кто что делал в админке (admin_audit_log);
 *  - «Бот и сайт» (?tab=bot) — что бот отправил, что покупатели делали на сайте и в Mini App (содержимое приходит снаружи: `botTab`,
 *    чтобы фича не зависела от components/journal и не было цикла через OrderDrawer).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AdminAuditTab } from "./AdminAuditTab";

type JournalTab = "admin" | "bot";

export function AuditScreen({ botTab }: { botTab: ReactNode }) {
  return (
    <Suspense>
      <Journal botTab={botTab} />
    </Suspense>
  );
}

function Journal({ botTab }: { botTab: ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const tab: JournalTab = sp.get("tab") === "bot" ? "bot" : "admin";

  function setTab(t: JournalTab) {
    router.replace(t === "bot" ? "/audit?tab=bot" : "/audit", { scroll: false });
  }

  return (
    <div className="min-w-0">
      <PageHeader
        title="Журнал"
        subtitle={
          tab === "bot"
            ? "Что бот кому отправил и дошло ли, что покупатели делали на сайте и в Mini App, оплаты."
            : "Кто и когда что менял в админке: заказы, оплата и возвраты, товары, входы."
        }
      />
      <div className="mb-4">
        <SegmentedControl<JournalTab>
          options={[
            { value: "admin", label: "Админка" },
            { value: "bot", label: "Бот и сайт" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === "bot" ? botTab : <AdminAuditTab />}
    </div>
  );
}
