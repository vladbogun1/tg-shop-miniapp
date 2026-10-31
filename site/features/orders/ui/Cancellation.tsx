"use client";

import { Ban, CheckCircle2, Clock, MessageCircle, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { type customerCancelMode } from "@shop/core/orders";
import { type OrderDetail } from "@shop/core/types";
import { useI18n } from "@/i18n/context";
import { useFmt } from "@/lib/use-fmt";
import { CancelOrder, RequestCancel } from "./CancelForms";

type CancelMode = ReturnType<typeof customerCancelMode>;

/**
 * Everything about cancelling, per `customerCancelMode`: the unpaid cancel dialog (reason picker),
 * the request form for a paid order, the request's state, the "bank is processing" hint and, once
 * shipped, the returns link.
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
  const { t, href } = useI18n();
  const fmt = useFmt();

  switch (mode) {
    case "CANCEL":
      return open ? (
        <CancelOrder orderId={order.id} onClose={() => setOpen(false)} onDone={onDone} />
      ) : (
        <DangerButton onClick={() => setOpen(true)} icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}>
          {t("cancel.button")}
        </DangerButton>
      );
    case "REQUEST":
      return open ? (
        <RequestCancel orderId={order.id} onClose={() => setOpen(false)} onDone={onDone} />
      ) : (
        <DangerButton onClick={() => setOpen(true)} icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}>
          {t("cancel.request.button")}
        </DangerButton>
      );
    case "PROCESSING":
      return (
        <div className="flex flex-col items-start gap-2">
          <DangerButton disabled icon={<Ban className="h-4 w-4" strokeWidth={2.25} />}>
            {t("cancel.button")}
          </DangerButton>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--muted)]">
            <Clock className="h-4 w-4 shrink-0" strokeWidth={2.25} /> {t("cancel.processing")}
          </p>
        </div>
      );
    case "PENDING":
      return (
        <StateCard tone="warn" icon={<Clock className="h-5 w-5" strokeWidth={2} />} title={t("cancel.request.pending.title")}>
          <p>{t("cancel.request.pending.text")}</p>
          {order.cancelRequestReason && (
            <p className="mt-2 text-[var(--muted)]">
              {t("cancel.request.yourReason")}: <span className="text-[var(--ink)]">{order.cancelRequestReason}</span>
              {order.cancelRequestedAt && <span className="text-[var(--faint)]"> · {fmt.dateTime(order.cancelRequestedAt)}</span>}
            </p>
          )}
        </StateCard>
      );
    case "DECLINED":
      return (
        <StateCard tone="danger" icon={<XCircle className="h-5 w-5" strokeWidth={2} />} title={t("cancel.request.declined.title")}>
          {order.cancelRequestAdminComment && (
            <p>
              {t("cancel.request.shopComment")}: <span className="font-semibold">{order.cancelRequestAdminComment}</span>
            </p>
          )}
          <p className="mt-2 text-[var(--muted)]">{t("cancel.request.declined.text")}</p>
          <a
            href="#chat"
            className="mt-3 inline-flex min-h-11 items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2.25} /> {t("cancel.toChat")}
          </a>
        </StateCard>
      );
    case "APPROVED":
      return (
        <StateCard tone="ok" icon={<CheckCircle2 className="h-5 w-5" strokeWidth={2} />} title={t("cancel.request.approved.title")}>
          <p>{t("cancel.request.approved.text")}</p>
        </StateCard>
      );
    case "RETURNS":
      return (
        <div className="flex flex-col gap-2 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] p-4 text-[13px] font-medium text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>{t("cancel.returns.text")}</p>
          <Link
            href={href("/returns")}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--accent-hi)]"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2.25} /> {t("cancel.returns.link")}
          </Link>
        </div>
      );
    default:
      return null;
  }
}

function DangerButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-11 items-center justify-center gap-2 self-start rounded-[var(--r)] border border-[color-mix(in_srgb,var(--danger)_55%,transparent)] bg-transparent px-4 font-display text-[13px] font-bold uppercase tracking-[.06em] text-[var(--danger)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {icon} {children}
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
    <section
      className="nb flex items-start gap-3 p-5"
      style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, background: `color-mix(in srgb, ${c} 8%, var(--surface))` }}
      aria-live="polite"
    >
      <span className="mt-0.5 shrink-0" style={{ color: c }}>
        {icon}
      </span>
      <div className="min-w-0 text-[14px] font-medium text-[var(--ink)]">
        <p className="mb-1 font-display text-[15px] font-bold uppercase tracking-[.06em]" style={{ color: c }}>
          {title}
        </p>
        {children}
      </div>
    </section>
  );
}
