"use client";

import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/orders";
import type { TeamAdmin } from "../api";
import type { TeamRow } from "../model/team-rows";
import { InviteBadge, InviteWho, LastLogin, StatusBadges, TwoFa, Who } from "./AdminCells";
import { RowMenu, type MenuItem } from "./RowMenu";

interface Props {
  rows: TeamRow[];
  itemsFor: (row: TeamRow) => MenuItem[];
  askFinance: (admin: TeamAdmin, on: boolean) => void;
}

/** Desktop: table; phone: cards. */
export function TeamList({ rows, itemsFor, askFinance }: Props) {
  if (rows.length === 0) return <EmptyState icon={UsersRound} title="Админов нет" />;
  return (
    <>
            <div className="card thin-scroll hidden overflow-x-auto p-0 md:block">
              <table className="data-table min-w-[940px]">
                <thead>
                  <tr>
                    <th>Админ</th>
                    <th>Роль</th>
                    <th>2FA</th>
                    <th>Финансы</th>
                    <th>Последний вход</th>
                    <th>Устройства</th>
                    <th>Создан</th>
                    <th className="w-12" aria-label="Действия" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) =>
                    r.type === "admin" ? (
                      <tr key={`a${r.admin.telegramUserId}`} data-admin={r.admin.telegramUserId} className={cn(!r.admin.active && "opacity-70")}>
                        <td>
                          <Who admin={r.admin} />
                        </td>
                        <td>
                          <StatusBadges admin={r.admin} />
                        </td>
                        <td>
                          <TwoFa on={r.admin.totpEnabled} />
                        </td>
                        <td>
                          <FinanceSwitch admin={r.admin} askFinance={askFinance} />
                        </td>
                        <td>
                          <LastLogin admin={r.admin} />
                        </td>
                        <td className="tabular">{r.admin.trustedDevices}</td>
                        <td className="tabular whitespace-nowrap text-[var(--text-muted)]">
                          {r.admin.createdAt ? formatDateTime(r.admin.createdAt) : "—"}
                        </td>
                        <td>
                          <RowMenu row={r} itemsFor={itemsFor} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={`i${r.invite.id}`} data-invite={r.invite.telegramUserId}>
                        <td>
                          <InviteWho invite={r.invite} />
                        </td>
                        <td>
                          <InviteBadge invite={r.invite} />
                        </td>
                        <td className="text-[var(--text-faint)]">—</td>
                        <td className="text-[var(--text-faint)]">—</td>
                        <td className="text-[var(--text-faint)]">ещё не входил</td>
                        <td className="text-[var(--text-faint)]">—</td>
                        <td className="tabular whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(r.invite.createdAt)}</td>
                        <td>
                          <RowMenu row={r} itemsFor={itemsFor} />
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2.5 md:hidden">
              {rows.map((r) =>
                r.type === "admin" ? (
                  <div key={`a${r.admin.telegramUserId}`} data-admin={r.admin.telegramUserId} className={cn("card p-3.5", !r.admin.active && "opacity-75")}>
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <Who admin={r.admin} />
                      </div>
                      <RowMenu row={r} itemsFor={itemsFor} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadges admin={r.admin} />
                      <TwoFa on={r.admin.totpEnabled} />
                    </div>
                    <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
                      <dt className="self-center text-[var(--text-faint)]">Финансы</dt>
                      <dd className="flex justify-end">
                        <FinanceSwitch admin={r.admin} askFinance={askFinance} />
                      </dd>
                      <dt className="text-[var(--text-faint)]">Последний вход</dt>
                      <dd className="min-w-0 text-right">
                        <LastLogin admin={r.admin} compact />
                      </dd>
                      <dt className="text-[var(--text-faint)]">Устройства</dt>
                      <dd className="tabular text-right">{r.admin.trustedDevices}</dd>
                      <dt className="text-[var(--text-faint)]">Создан</dt>
                      <dd className="tabular text-right text-[var(--text-muted)]">
                        {r.admin.createdAt ? formatDateTime(r.admin.createdAt) : "—"}
                      </dd>
                    </dl>
                  </div>
                ) : (
                  <div key={`i${r.invite.id}`} data-invite={r.invite.telegramUserId} className="card border-dashed p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <InviteWho invite={r.invite} />
                      </div>
                      <RowMenu row={r} itemsFor={itemsFor} />
                    </div>
                    <div className="mt-2">
                      <InviteBadge invite={r.invite} />
                    </div>
                  </div>
                )
              )}
            </div>
    </>
  );
}

/** «Финансы»: закупка, расходы, маржа. Главному админу включено всегда; смена — по коду из приложения. */
function FinanceSwitch({ admin, askFinance }: { admin: TeamAdmin; askFinance: Props["askFinance"] }) {
  const locked = admin.status === "SUPER_ADMIN" || !admin.active || admin.self;
  return (
    <span title={admin.status === "SUPER_ADMIN" ? "У главного админа всегда включено" : undefined}>
      <Toggle checked={admin.finance || admin.status === "SUPER_ADMIN"} disabled={locked} onChange={(v) => askFinance(admin, v)} />
    </span>
  );
}
