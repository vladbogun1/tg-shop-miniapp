"use client";

import { formatDateTime, timeAgo } from "@shop/core/time";
import { CopyButton } from "@/components/ui/CopyButton";
import { languageDetail } from "../../model/user";
import type { UserCardDto } from "../../model/types";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2.5 last:border-b-0">
      <dt className="field-label !text-[11px]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[13px] text-[var(--text)]">{children}</dd>
    </div>
  );
}

/** Вкладка «Данные»: то, что известно о покупателе, включая откуда взят язык. */
export function ProfileData({ user }: { user: UserCardDto }) {
  return (
    <dl className="card px-4">
      <Row label="Telegram ID">
        <span className="inline-flex items-center gap-2">
          <span className="tabular">{user.telegramUserId}</span>
          <CopyButton value={String(user.telegramUserId)} />
        </span>
      </Row>
      <Row label="Username">{user.username ? "@" + user.username : "—"}</Row>
      <Row label="Язык">{languageDetail(user)}</Row>
      <Row label="Premium">{user.premium ? "Да" : "Нет"}</Row>
      <Row label="Заблокировал бота">
        {user.botBlocked ? <span className="text-[var(--danger-ink)]">Да — сообщение не дойдёт</span> : "Нет"}
      </Row>
      <Row label="Регистрация">{user.createdAt ? formatDateTime(user.createdAt) : "—"}</Row>
      <Row label="Был(а)">{user.lastSeenAt ? `${timeAgo(user.lastSeenAt)} · ${formatDateTime(user.lastSeenAt)}` : "—"}</Row>
    </dl>
  );
}
