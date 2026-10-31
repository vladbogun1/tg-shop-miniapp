"use client";

import type { ReactNode } from "react";
import { ExternalLink, User, Users } from "lucide-react";
import { formatDateTime } from "@shop/core/time";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@shop/ui/admin-button";
import { detailPairs } from "../model/details";
import { customerLabel, errorLabel, sourceLabel, UNREACHABLE } from "../model/labels";
import { SOURCE_TONE } from "../model/tone";
import type { ActivityRow } from "../model/types";
import type { RowActions } from "./use-row-actions";

/** Раскрытая строка: причина простыми словами, сырой ответ Telegram/банка, поля события, ссылки. */
export function EventDetails({ r, actions }: { r: ActivityRow; actions: RowActions }) {
  const pairs = detailPairs(r.details);
  return (
    <div className="border-t border-dashed border-[var(--line)] bg-[var(--bg-2)] px-3.5 py-3 text-[12.5px] md:pl-[calc(132px+2.75rem)]">
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
        <Field label="Когда">{formatDateTime(r.createdAt)}</Field>
        <Field label="Источник">
          <Badge tone={SOURCE_TONE[r.source] ?? "neutral"}>{sourceLabel(r.source)}</Badge>
          <span className="ml-2 font-mono text-[11px] text-[var(--text-faint)]">{r.type}</span>
        </Field>
        {r.errorCode && <ReasonField r={r} code={r.errorCode} />}
        {r.error && (
          <Field label="Ответ">
            <code className="break-all font-mono text-[11.5px] text-[var(--text-muted)]">{r.error}</code>
          </Field>
        )}
        {r.recipient === "ADMINS" && r.chatId && (
          <Field label="Чат">
            <span className="font-mono text-[11.5px]">{r.chatId}</span>
          </Field>
        )}
        {r.tgUserId && <CustomerField r={r} />}
        {r.groupId && (
          <Field label="Группа">
            <span className="font-mono text-[11.5px]">{r.groupId}</span>
          </Field>
        )}
        {pairs.map(([k, v]) => (
          <Field key={k} label={k}>
            <span className="break-words">{v}</span>
          </Field>
        ))}
      </dl>
      {(r.orderId || r.tgUserId) && <DetailActions r={r} actions={actions} />}
    </div>
  );
}

function ReasonField({ r, code }: { r: ActivityRow; code: string }) {
  return (
    <Field label="Причина">
      <span className={r.result === "FAILED" ? "font-semibold text-[#F87171]" : "text-[var(--warn)]"}>{errorLabel(code)}</span>
      {UNREACHABLE.has(code) && (
        <span className="ml-2 text-[var(--text-faint)]">
          — бот не может написать этому человеку, пока тот снова не нажмёт /start
        </span>
      )}
      {code === "RATE_LIMITED" && (
        <span className="ml-2 text-[var(--text-faint)]">— Telegram попросил подождать, сообщение не ушло</span>
      )}
    </Field>
  );
}

function CustomerField({ r }: { r: ActivityRow }) {
  return (
    <Field label="Покупатель">
      {customerLabel(r)}
      {r.customerUsername && r.customerName ? <span className="text-[var(--text-faint)]"> · @{r.customerUsername}</span> : null}
      <span className="ml-2 font-mono text-[11px] text-[var(--text-faint)]">tg {r.tgUserId}</span>
    </Field>
  );
}

function DetailActions({ r, actions }: { r: ActivityRow; actions: RowActions }) {
  const { orderId, tgUserId } = r;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {orderId && (
        <Button size="sm" variant="surface" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => actions.openOrder(orderId)}>
          Заказ #{orderId.slice(0, 8)}
        </Button>
      )}
      {tgUserId && (
        <>
          <Button size="sm" variant="surface" icon={<User className="h-3.5 w-3.5" />} onClick={() => actions.openCustomer(r)}>
            Профиль покупателя
          </Button>
          <Button size="sm" variant="ghost" icon={<Users className="h-3.5 w-3.5" />} onClick={() => actions.filterCustomer(r)}>
            Все события покупателя
          </Button>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="field-label !normal-case pt-0.5 !text-[var(--text-faint)]">{label}</dt>
      <dd className="min-w-0 text-[var(--text)]">{children}</dd>
    </>
  );
}
