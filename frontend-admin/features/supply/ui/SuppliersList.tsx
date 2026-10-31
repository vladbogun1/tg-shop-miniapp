"use client";

import { Factory } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { useSuppliersList } from "../queries";

export function SuppliersList() {
  const q = useSuppliersList();
  return (
    <QueryState isLoading={q.isLoading} isError={q.isError} error={q.error} refetch={q.refetch}>
      {q.data && q.data.length === 0 ? (
        <EmptyState icon={Factory} title="Поставщиков нет" description="Добавьте завод или продавца, у которого заказываете." />
      ) : (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          {q.data?.map((s) => (
            <div key={s.id} className="card p-3.5">
              <div className="text-[14px] font-semibold text-[var(--text)]">{s.name}</div>
              {s.note && <div className="mt-0.5 break-words text-[12.5px] text-[var(--text-muted)]">{s.note}</div>}
            </div>
          ))}
        </div>
      )}
    </QueryState>
  );
}
