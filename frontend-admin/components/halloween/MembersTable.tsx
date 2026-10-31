"use client";

/**
 * Halloween participants: the same table / phone cards as «Пользователи», one row per person with the
 * pumpkins, both draws (tickets and chance), money in the event window and in total, the earlier-customer
 * invite and what the bot got back. A row opens the shop profile; «Исключить» takes the person out of both draws.
 */
import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Download, Inbox } from "lucide-react";
import type { HwMember, HwMembers } from "@/lib/halloween-api";
import { money } from "@/lib/money";
import { timeAgo } from "@/lib/orders";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { FILTERS, INVITE, MOBILE_SORTS, displayName, filterCount, initials, pct, toCsv, view, type Filter, type SortDir, type SortKey } from "./member-view";

const PAGE = 50;

export interface MemberActions {
  onOpen: (m: HwMember) => void;
  onToggleExclude: (m: HwMember) => void;
  onEditManual: (m: HwMember) => void;
}

export function MembersTable({ data, actions }: { data: HwMembers; actions: MemberActions }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("pumpkins");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => view(data.rows, q, filter, sortBy, dir), [data.rows, q, filter, sortBy, dir]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const sort = { sortBy, dir, toggle: (c: SortKey) => { if (c === sortBy) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortBy(c); setDir("desc"); } setPage(0); } };

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[200px] flex-1">
            <Input placeholder="Поиск: имя, @username, ID" icon={<Search className="h-4 w-4" />} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <Button variant="surface" icon={<Download className="h-4 w-4" />} onClick={() => downloadCsv(rows)}>CSV</Button>
        </div>
        <SegmentedControl<Filter> size="sm" value={filter} onChange={(f) => { setFilter(f); setPage(0); }}
          options={FILTERS.map((f) => ({ ...f, count: filterCount(data.rows, f.value) }))} />
        <div className="md:hidden">
          <Select<string> label="Сортировка" value={`${sortBy}:${dir}`} options={MOBILE_SORTS}
            onChange={(v) => { const [c, d] = v.split(":"); setSortBy(c as SortKey); setDir(d as SortDir); setPage(0); }} />
        </div>
      </div>

      <div className="thin-scroll hidden overflow-x-auto md:block">
        <table className="data-table [&_td:first-child]:pl-4 [&_th:first-child]:pl-4">
          <thead>
            <tr>
              <Th label="Участник" col="name" {...sort} />
              <Th label="Тыквы" col="pumpkins" {...sort} />
              <Th label="Шанс 🎃" col="pumpkinTickets" {...sort} />
              <Th label="За акцию" col="spendMinor" {...sort} />
              <Th label="Шанс 🛒" col="orderTickets" {...sort} />
              <Th label="Всего" col="lifetimeSpendMinor" {...sort} />
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.tgId} onClick={() => actions.onOpen(m)} className={`cursor-pointer ${m.excluded !== null ? "opacity-55" : ""}`}>
                <td><Who m={m} /></td>
                <td className="tabular whitespace-nowrap">
                  <b className="text-[var(--text)]">{m.pumpkins}</b><span className="text-[var(--text-faint)]"> / {data.rules.goal}</span>
                  <div className="text-[11px] text-[var(--text-faint)]">{m.lastPumpkinAt ? `${m.pumpkinDays} дн. · ${timeAgo(new Date(m.lastPumpkinAt).toISOString())}` : "—"}</div>
                </td>
                <td className="tabular whitespace-nowrap"><Chance tickets={m.pumpkinTickets} chance={m.pumpkinChance} /></td>
                <td className="tabular whitespace-nowrap">
                  {m.spendMinor ? <b className="text-[var(--text)]">{money(m.spendMinor)}</b> : <span className="text-[var(--text-faint)]">—</span>}
                  <div className="text-[11px] text-[var(--text-faint)]">{m.orders ? `${m.orders} зак.` : ""}</div>
                </td>
                <td className="tabular whitespace-nowrap"><Chance tickets={m.orderTickets} chance={m.orderChance} /></td>
                <td className="tabular whitespace-nowrap text-[var(--text-muted)]">
                  {money(m.lifetimeSpendMinor)}<div className="text-[11px] text-[var(--text-faint)]">{m.lifetimeOrders} зак.</div>
                  <ManualNote m={m} onClick={() => actions.onEditManual(m)} />
                </td>
                <td><div className="flex flex-col items-start gap-1">{m.invite && <Badge tone={INVITE[m.invite].tone} dot>{INVITE[m.invite].label}</Badge>}<BotBadge m={m} /></div></td>
                <td onClick={(e) => e.stopPropagation()}><ExcludeButton m={m} locked={data.locked} onClick={() => actions.onToggleExclude(m)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2.5 p-4 md:hidden">
        {shown.map((m) => <MemberCard key={m.tgId} m={m} data={data} actions={actions} />)}
      </div>

      {rows.length === 0 && (
        <div className="p-6"><EmptyState icon={Inbox} title="Никого" description="Измените поиск или фильтр." /></div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] p-4">
        <span className="field-label tabular mr-1 !text-[11px] !text-[var(--text-faint)]">{rows.length} чел. · стр. {page + 1} из {pages}</span>
        <Button variant="surface" size="icon" disabled={page === 0} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-4 w-4" />} aria-label="Назад" />
        <Button variant="surface" size="icon" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} icon={<ChevronRight className="h-4 w-4" />} aria-label="Вперёд" />
      </div>
    </div>
  );
}

function MemberCard({ m, data, actions }: { m: HwMember; data: HwMembers; actions: MemberActions }) {
  return (
    <div className={`card flex flex-col gap-2.5 p-3.5 ${m.excluded !== null ? "opacity-60" : ""}`}>
      <button type="button" className="flex min-w-0 items-center justify-between gap-2 text-left" onClick={() => actions.onOpen(m)}>
        <Who m={m} />
        <BotBadge m={m} />
      </button>
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <Cell label="Тыквы" value={`${m.pumpkins} / ${data.rules.goal}`} sub={m.pumpkinTickets ? pct(m.pumpkinChance) : "—"} />
        <Cell label="За акцию" value={m.spendMinor ? money(m.spendMinor) : "—"} sub={m.orderTickets ? `${m.orderTickets} бил. · ${pct(m.orderChance)}` : "—"} />
        <Cell label="Всего" value={money(m.lifetimeSpendMinor)} sub={`${m.lifetimeOrders} зак.`} />
      </div>
      <ManualNote m={m} onClick={() => actions.onEditManual(m)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {m.invite ? <Badge tone={INVITE[m.invite].tone} dot>{INVITE[m.invite].label}</Badge> : <span />}
        <ExcludeButton m={m} locked={data.locked} onClick={() => actions.onToggleExclude(m)} />
      </div>
    </div>
  );
}

function Who({ m }: { m: HwMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="accent-tint font-display grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-md)] text-[12px] font-bold">{initials(m)}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-[var(--text)]">{displayName(m)}</span>
          {m.old && <Badge tone="accent">постоянный</Badge>}
          {m.excluded !== null && <Badge tone="danger">исключён</Badge>}
        </div>
        <div className="truncate text-[11px] text-[var(--text-faint)]">
          {m.username ? "@" + m.username + " · " : ""}#{m.tgId}{m.excluded ? ` · ${m.excluded}` : ""}
        </div>
      </div>
    </div>
  );
}

/** «+N до базы»: money typed by hand for purchases older than the shop database; opens the editor. */
function ManualNote({ m, onClick }: { m: HwMember; onClick: () => void }) {
  if (!m.manualSpendMinor) return null;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-left text-[11px] font-semibold text-[var(--accent)] underline-offset-2 hover:underline">
      +{money(m.manualSpendMinor)} до базы
    </button>
  );
}

function Chance({ tickets, chance }: { tickets: number; chance: number }) {
  if (!tickets) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <>
      <b className="text-[var(--text)]">{pct(chance)}</b>
      <div className="text-[11px] text-[var(--text-faint)]">{tickets} бил.</div>
    </>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-[var(--r-sm)] bg-[var(--bg-2)] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-faint)]">{label}</div>
      <div className="tabular truncate font-semibold text-[var(--text)]">{value}</div>
      <div className="tabular truncate text-[11px] text-[var(--text-faint)]">{sub}</div>
    </div>
  );
}

function BotBadge({ m }: { m: HwMember }) {
  if (m.broadcast === "blocked" || m.botBlocked) return <Badge tone="danger" dot>заблокировал</Badge>;
  if (m.broadcast === "ok") return <Badge tone="ok" dot>доставлено</Badge>;
  if (m.broadcast === "error") return <Badge tone="warn" dot>ошибка</Badge>;
  return <Badge dot>не слали</Badge>;
}

function ExcludeButton({ m, locked, onClick }: { m: HwMember; locked: HwMembers["locked"]; onClick: () => void }) {
  if (locked.pumpkins || locked.orders) return null;
  const out = m.excluded !== null;
  if (!out && !m.pumpkinTickets && !m.orderTickets) return null;
  return (
    <Button size="sm" variant={out ? "surface" : "ghost"} onClick={onClick}>
      {out ? "Вернуть" : "Исключить"}
    </Button>
  );
}

function Th({ label, col, sortBy, dir, toggle }: { label: string; col: SortKey; sortBy: SortKey; dir: SortDir; toggle: (c: SortKey) => void }) {
  const active = sortBy === col;
  return (
    <th aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => toggle(col)}
        className={`flex items-center gap-1 whitespace-nowrap uppercase tracking-[inherit] transition-colors hover:text-[var(--text)] ${active ? "text-[var(--accent-hi)]" : ""}`}>
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function downloadCsv(rows: HwMember[]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `halloween-participants-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
