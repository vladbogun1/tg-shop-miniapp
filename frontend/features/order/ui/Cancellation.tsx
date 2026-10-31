"use client";

import { Ban, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { customerCancelMode } from "@shop/core/orders";
import { useT } from "@/i18n/context";
import type { OrderDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { haptic } from "@/platform/telegram";
import { CancelOrder, RequestCancel } from "./CancelForms";

type CancelMode = ReturnType<typeof customerCancelMode>;

/**
 * Cancelling, per the shared `customerCancelMode`: the unpaid cancel dialog, the request form of a
 * paid order and its states, the "bank is processing" hint, and — once shipped — the chat.
 */
export function Cancellation({
  order,
  mode,
  open,
  setOpen,
  onDone,
}: {
  order: OrderDetail;
  mode: CancelMode;
  open: boolean;
  setOpen: (v: boolean) => void;
  onDone: () => void;
}) {
  const t = useT();
  switch (mode) {
    case "CANCEL":
      return open ? (
        <CancelOrder orderId={order.id} onClose={() => setOpen(false)} onDone={onDone} />
      ) : (
        <DangerButton
          onClick={() => {
            haptic();
            setOpen(true);
          }}
        >
          {t("cancel.button")}
        </DangerButton>
      );
    case "REQUEST":
      return open ? (
        <RequestCancel orderId={order.id} onClose={() => setOpen(false)} onDone={onDone} />
      ) : (
        <DangerButton
          onClick={() => {
            haptic();
            setOpen(true);
          }}
        >
          {t("cancel.request.button")}
        </DangerButton>
      );
    case "PROCESSING":
      return (
        <div className="flex flex-col gap-2">
          <DangerButton disabled>{t("cancel.button")}</DangerButton>
          <p className="flex items-center justify-center gap-1.5 text-center text-[12px] text-[var(--muted)]">
            <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} /> {t("cancel.processing")}
          </p>
        </div>
      );
    case "PENDING":
      return (
        <StateCard tone="warn" icon={<Clock className="h-5 w-5" strokeWidth={2.25} />} title={t("cancel.request.pending.title")}>
          <p>{t("cancel.request.pending.text")}</p>
          {order.cancelRequestReason && (
            <p className="mt-2 text-[var(--muted)]">
              {t("cancel.request.yourReason")}: <span className="text-[var(--ink)]">{order.cancelRequestReason}</span>
            </p>
          )}
          {order.cancelRequestedAt && (
            <p className="mt-1 text-[11px] text-[var(--faint)]">{formatDateTime(order.cancelRequestedAt)}</p>
          )}
        </StateCard>
      );
    case "DECLINED":
      return (
        <StateCard tone="danger" icon={<XCircle className="h-5 w-5" strokeWidth={2.25} />} title={t("cancel.request.declined.title")}>
          {order.cancelRequestAdminComment && (
            <p>
              {t("cancel.request.shopComment")}: <span className="font-semibold">{order.cancelRequestAdminComment}</span>
            </p>
          )}
          <p className="mt-2 text-[var(--muted)]">{t("cancel.request.declined.text")}</p>
        </StateCard>
      );
    case "APPROVED":
      return (
        <StateCard tone="ok" icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2.25} />} title={t("cancel.request.approved.title")}>
          <p>{t("cancel.request.approved.text")}</p>
        </StateCard>
      );
    case "RETURNS":
      return (
        <p className="rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[12px] text-[var(--muted)]">
          {t("cancel.returns.text")}
        </p>
      );
    default:
      return null;
  }
}

function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-display tap nb-press flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-transparent py-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--danger)] disabled:opacity-45"
    >
      <Ban className="h-4 w-4" strokeWidth={2.25} /> {children}
    </button>
  );
}

const STATE_TONE = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)" } as const;

function StateCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof STATE_TONE;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const c = STATE_TONE[tone];
  return (
    <div
      className="nb flex items-start gap-2.5 p-4"
      style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 10%, var(--surface))` }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: c }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-[13px] text-[var(--ink)]">
        <p className="nb-up mb-1 text-[14px] font-bold" style={{ color: c }}>
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}
