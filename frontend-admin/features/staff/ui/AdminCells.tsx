"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@shop/core/time";
import type { TeamAdmin, TeamInvite } from "../api";
import { adminName, inviteName } from "../model/roles";

export function Who({ admin }: { admin: TeamAdmin }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-[14px] font-semibold text-[var(--text)]">{adminName(admin)}</span>
        {admin.self && <Badge tone="info">Это вы</Badge>}
      </div>
      <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">
        {admin.username ? <span className="font-mono">{admin.username}</span> : <span className="text-[var(--text-faint)]">без логина · вход через Telegram</span>}
      </div>
      <div className="truncate text-[11.5px] text-[var(--text-faint)]">
        tg {admin.telegramUserId}
        {admin.telegramLabel ? ` · ${admin.telegramLabel}` : ""}
      </div>
    </div>
  );
}

export function InviteWho({ invite }: { invite: TeamInvite }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[14px] font-semibold text-[var(--text)]">{inviteName(invite)}</div>
      <div className="truncate text-[11.5px] text-[var(--text-faint)]">
        tg {invite.telegramUserId}
        {invite.telegramLabel ? ` · ${invite.telegramLabel}` : ""}
        {invite.invitedByName ? ` · пригласил ${invite.invitedByName}` : ""}
      </div>
    </div>
  );
}

export function StatusBadges({ admin }: { admin: TeamAdmin }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {admin.status === "BLOCKED" ? (
        <Badge tone="danger" dot>
          Заблокирован
        </Badge>
      ) : admin.status === "SUPER_ADMIN" ? (
        <Badge tone="accent">Главный</Badge>
      ) : (
        <Badge>Админ</Badge>
      )}
      {admin.invite && (
        <Badge tone="info" className="whitespace-nowrap">
          {admin.invite.kind === "PASSWORD_RESET" ? "Сброс пароля" : "Приглашён"} до {formatDateTime(admin.invite.expiresAt)}
        </Badge>
      )}
      {admin.lockedUntil && <Badge tone="warn">Вход закрыт до {formatDateTime(admin.lockedUntil)}</Badge>}
    </span>
  );
}

export function InviteBadge({ invite }: { invite: TeamInvite }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone="info" dot className="whitespace-nowrap">
        Приглашён до {formatDateTime(invite.expiresAt)}
      </Badge>
      <Badge>{invite.role === "SUPER_ADMIN" ? "Главный" : "Админ"}</Badge>
      {!invite.delivered && <Badge tone="warn">бот не доставил</Badge>}
    </span>
  );
}

export function TwoFa({ on }: { on: boolean }) {
  return on ? (
    <Badge tone="ok">
      <ShieldCheck className="h-3 w-3" /> 2FA
    </Badge>
  ) : (
    <Badge tone="warn">
      <ShieldOff className="h-3 w-3" /> Без 2FA
    </Badge>
  );
}

export function LastLogin({ admin, compact = false }: { admin: TeamAdmin; compact?: boolean }) {
  const l = admin.lastLogin;
  if (!l) return <span className="text-[var(--text-faint)]">не входил</span>;
  const place = l.city || l.country || "место неизвестно";
  return (
    <span className={cn("inline-flex flex-col", compact && "items-end")}>
      <span className="tabular whitespace-nowrap text-[var(--text)]">{formatDateTime(l.at)}</span>
      <span className="truncate text-[11.5px] text-[var(--text-faint)]">{place}</span>
    </span>
  );
}
