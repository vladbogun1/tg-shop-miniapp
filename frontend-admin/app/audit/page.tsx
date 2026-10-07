"use client";

/**
 * Журнал (route "/audit"), two tabs (?tab=):
 *  - «Админка» — who did what in the admin panel (admin_audit_log, V14);
 *  - «Бот и сайт» (?tab=bot) — what the bot sent and whether it was delivered, what customers did
 *    on the website / in the Mini App, payments and jobs (activity_log, V47 — ActivityTab).
 *
 * «Админка»:
 * Filters: action, entity type, entity id, admin, period (calendar days in the shop timezone).
 * Newest first, 50 per page, «Ещё» loads the next page. Desktop: table; phone: cards.
 * Rows of orders/products link to the entity. Data: GET /api/admin/audit (+ /facets).
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ExternalLink, RotateCcw, ScrollText, Search } from "lucide-react";
import type { AuditEntry } from "@/lib/api";
import { extApi, type AuditFilter } from "@/lib/api-extra";
import {
  AUDIT_RISKY,
  auditActionLabel,
  auditEntityHref,
  auditEntityLabel,
} from "@/lib/audit";
import { formatDateTime } from "@/lib/orders";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/use-debounced";
import { PageHeader } from "@/components/layout/PageHeader";
import { ActivityTab } from "@/components/journal/ActivityTab";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { QueryState } from "@/components/ui/QueryState";
import { Select } from "@/components/ui/Select";

const PAGE = 50;

type JournalTab = "admin" | "bot";

export default function AuditPage() {
  return (
    <Suspense>
      <Journal />
    </Suspense>
  );
}

function Journal() {
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
      {tab === "bot" ? <ActivityTab /> : <AdminAuditTab />}
    </div>
  );
}

function AdminAuditTab() {
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
    [action, entityType, entityId, adminId, from, to]
  );
  const filtered = Object.values(filter).some((v) => v !== undefined);

  const facetsQ = useQuery({ queryKey: ["audit-facets"], queryFn: () => extApi.auditFacets(), staleTime: 60_000 });
  const logQ = useInfiniteQuery({
    queryKey: ["audit", filter],
    queryFn: ({ pageParam }) => extApi.audit(filter, pageParam, PAGE),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < PAGE ? undefined : all.length),
  });
  const rows = useMemo(() => logQ.data?.pages.flat() ?? [], [logQ.data]);

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

      {/* Filters */}
      <div className="card mb-5 grid min-w-0 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Select
          label="Действие"
          value={action}
          onChange={setAction}
          options={[
            { value: "", label: "Все действия" },
            ...(facets?.actions ?? []).map((a) => ({ value: a, label: auditActionLabel(a) })),
          ]}
        />
        <Select
          label="Объект"
          value={entityType}
          onChange={setEntityType}
          options={[
            { value: "", label: "Все объекты" },
            ...(facets?.entityTypes ?? []).map((t) => ({ value: t, label: auditEntityLabel(t) })),
          ]}
        />
        <Input
          label="ID объекта"
          placeholder="UUID заказа / товара"
          icon={<Search className="h-4 w-4" />}
          value={entityIdRaw}
          onChange={(e) => setEntityIdRaw(e.target.value)}
        />
        <Select
          label="Админ"
          value={adminId}
          onChange={setAdminId}
          options={[
            { value: "", label: "Все" },
            ...(facets?.admins ?? []).map((a) => ({
              value: String(a.adminId),
              label: a.adminId === 0 ? "— (неизвестный логин)" : a.adminName,
            })),
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

      <QueryState
        isLoading={logQ.isLoading}
        isError={logQ.isError}
        error={logQ.error}
        refetch={() => logQ.refetch()}
        loadingLabel="Загружаем журнал"
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={filtered ? "Ничего не найдено" : "Журнал пуст"}
            description={filtered ? "Измените фильтры или период." : "Здесь появятся действия админов."}
          />
        ) : (
          <>
            {/* Desktop table */}
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
                      <td className="tabular whitespace-nowrap text-[var(--text-muted)]">
                        {formatDateTime(e.createdAt)}
                      </td>
                      <td className="font-semibold">{who(e)}</td>
                      <td>
                        <ActionBadge code={e.action} />
                      </td>
                      <td>
                        <EntityCell e={e} />
                      </td>
                      <td className="max-w-[420px] break-words">{e.details || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone cards */}
            <div className="flex flex-col gap-2.5 md:hidden">
              {rows.map((e) => (
                <div key={e.id} className="card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ActionBadge code={e.action} />
                    <span className="tabular text-[12px] text-[var(--text-muted)]">{formatDateTime(e.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 text-[13px] font-semibold text-[var(--text)]">{who(e)}</div>
                  {e.details && <p className="mt-1 break-words text-[13px] text-[var(--text)]">{e.details}</p>}
                  <div className="mt-1.5">
                    <EntityCell e={e} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="field-label tabular !text-[var(--text-faint)]">
                Показано: {rows.length}
              </span>
              {logQ.hasNextPage && (
                <Button
                  variant="surface"
                  loading={logQ.isFetchingNextPage}
                  onClick={() => logQ.fetchNextPage()}
                >
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

function who(e: AuditEntry): string {
  if (e.adminId === 0) return "—";
  return e.adminName || `#${e.adminId}`;
}

function ActionBadge({ code }: { code: string }) {
  return (
    <Badge tone={AUDIT_RISKY.has(code) ? "danger" : code.startsWith("ADMIN_LOGIN") ? "info" : "neutral"}>
      {auditActionLabel(code)}
    </Badge>
  );
}

function EntityCell({ e }: { e: AuditEntry }) {
  const href = auditEntityHref(e.entityType, e.entityId);
  const id = e.entityId ? (e.entityId.length > 12 ? `#${e.entityId.slice(0, 8)}` : e.entityId) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--text-muted)]")}>
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.06em]">{auditEntityLabel(e.entityType)}</span>
      {id &&
        (href ? (
          <Link href={href} className="hit inline-flex items-center gap-0.5 font-mono text-[var(--accent-hi)] hover:underline">
            {id}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : (
          <span className="font-mono">{id}</span>
        ))}
    </span>
  );
}
