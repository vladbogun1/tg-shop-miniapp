"use client";

import { Button } from "@shop/ui/admin-button";
import { RotateCcw, ScrollText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";
import { formatDateTime } from "@/lib/orders";
import { useDebounced } from "@/lib/use-debounced";
import type { AuditFilter } from "../api";
import { auditActionLabel, auditEntityLabel, readableAuditDetails } from "../model/audit-labels";
import { useAuditFacets, useAuditLog } from "../queries";
import { ActionBadge, auditWho, EntityCell } from "./AuditCells";

/** Фильтры: действие, объект, id объекта, админ, период (календарные дни по поясу магазина). Новые сверху, «Ещё» — следующая страница. */
export function AdminAuditTab() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityIdRaw, setEntityIdRaw] = useState("");
  const [adminId, setAdminId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const entityId = useDebounced(entityIdRaw.trim(), 400);

  const filter: AuditFilter = useMemo(
    () => ({
      action: action || undefined,
      entityType: entityType || undefined,
      entityId: entityId || undefined,
      adminId: adminId ? Number(adminId) : undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    [action, entityType, entityId, adminId, from, to],
  );
  const filtered = Object.values(filter).some((v) => v !== undefined);

  const facetsQ = useAuditFacets();
  const { q: logQ, rows } = useAuditLog(filter);

  function reset() {
    setAction("");
    setEntityType("");
    setEntityIdRaw("");
    setAdminId("");
    setFrom("");
    setTo("");
  }

  const facets = facetsQ.data;
  return (
    <div className="min-w-0">
      <div className="card mb-5 grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Select
          label="Действие"
          value={action}
          onChange={setAction}
          options={[{ value: "", label: "Все действия" }, ...(facets?.actions ?? []).map((a) => ({ value: a, label: auditActionLabel(a) }))]}
        />
        <Select
          label="Объект"
          value={entityType}
          onChange={setEntityType}
          options={[{ value: "", label: "Все объекты" }, ...(facets?.entityTypes ?? []).map((t) => ({ value: t, label: auditEntityLabel(t) }))]}
        />
        <Input label="ID объекта" placeholder="UUID заказа / товара" icon={<Search className="h-4 w-4" />} value={entityIdRaw} onChange={(e) => setEntityIdRaw(e.target.value)} />
        <Select
          label="Админ"
          value={adminId}
          onChange={setAdminId}
          options={[
            { value: "", label: "Все" },
            ...(facets?.admins ?? []).map((a) => ({ value: String(a.adminId), label: a.adminId === 0 ? "— (неизвестный логин)" : a.adminName })),
          ]}
        />
        <Input label="С" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <Input label="По" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        {filtered && (
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
              Сбросить фильтры
            </Button>
          </div>
        )}
      </div>

      <QueryState isLoading={logQ.isLoading} isError={logQ.isError} error={logQ.error} refetch={() => logQ.refetch()} loadingLabel="Загружаем журнал">
        {rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? "Ничего не найдено" : "Журнал пуст"}
            description={filtered ? "Измените фильтры или период." : "Здесь появятся действия админов."}
          />
        ) : (
          <>
            <div className="card thin-scroll hidden overflow-hidden overflow-x-auto p-0 md:block">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>Когда</th>
                    <th>Кто</th>
                    <th>Действие</th>
                    <th>Объект</th>
                    <th>Подробности</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="[&>td]:align-top">
                      <td className="tabular whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(e.createdAt)}</td>
                      <td className="font-semibold">{auditWho(e)}</td>
                      <td>
                        <ActionBadge code={e.action} />
                      </td>
                      <td>
                        <EntityCell e={e} />
                      </td>
                      <td className="max-w-[420px] break-words">{readableAuditDetails(e.details) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2.5 md:hidden">
              {rows.map((e) => (
                <div key={e.id} className="card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ActionBadge code={e.action} />
                    <span className="tabular text-[12px] text-[var(--text-muted)]">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-[var(--text)]">{auditWho(e)}</div>
                  {e.details && <p className="mt-1 break-words text-[13px] text-[var(--text)]">{readableAuditDetails(e.details)}</p>}
                  <div className="mt-1.5">
                    <EntityCell e={e} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="field-label tabular !text-[var(--text-faint)]">Показано: {rows.length}</span>
              {logQ.hasNextPage && (
                <Button variant="surface" loading={logQ.isFetchingNextPage} onClick={() => logQ.fetchNextPage()}>
                  Ещё
                </Button>
              )}
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
