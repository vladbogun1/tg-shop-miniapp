"use client";

/**
 * «Инциденты» (route "/incidents") — только для главного админа (SUPER_ADMIN). Случаи с деньгами и заказами,
 * которые стоит разобрать: найденные детектором и карточки с гипотезой. Открытые первыми; «Решено» требует
 * комментария. Бэкенд отвечает 403 всем остальным.
 */
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { incidentsOf, openCount, type IncidentStatus } from "../model/incidents";
import { useIncidentsQuery, useIsSuperAdmin } from "../queries";
import { IncidentCard } from "./IncidentCard";

export function IncidentsScreen() {
  const superAdmin = useIsSuperAdmin();
  const [tab, setTab] = useState<IncidentStatus>("OPEN");
  const q = useIncidentsQuery(superAdmin !== false);
  if (superAdmin === false) {
    return <EmptyState icon={ShieldAlert} title="Только для главного админа" />;
  }
  const all = q.data ?? [];
  const rows = incidentsOf(all, tab);
  const open = openCount(all);
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="Инциденты"
        subtitle="Случаи с деньгами и заказами, которые стоит разобрать. Видите только вы."
        actions={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "OPEN", label: `Открытые${open ? ` · ${open}` : ""}` },
              { value: "RESOLVED", label: "Решённые" },
            ]}
          />
        }
      />
      <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch} loadingLabel="Проверяем данные…">
        {rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={tab === "OPEN" ? "Открытых инцидентов нет" : "Решённых пока нет"} />
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((i) => (
              <IncidentCard key={i.id} i={i} />
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
