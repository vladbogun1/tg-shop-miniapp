"use client";

/**
 * Payment pieces shared by the success page and the order page: requisites with copy buttons and
 * the transfer-screenshot upload. Behaviour copied from the Mini App: the screenshot goes through
 * POST /api/me/uploads and POST /api/me/orders/{id}/pay, which only RECORDS A CLAIM — an admin
 * confirms the money actually arrived.
 */
import { Check, CheckCircle2, Clock, Copy, CreditCard, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { PaymentRequisites } from "@shop/shared";
import { Button } from "@/components/ui/Button";
import { useT } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";
import { copyText } from "@/lib/hooks";

export function hasAnyRequisite(r: PaymentRequisites | null | undefined): r is PaymentRequisites {
  return !!r && Boolean(r.cardNumber || r.iban || r.recipient || r.edrpou || r.purpose || r.note);
}

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }
      }}
      aria-label={t("common.copy", { label })}
      title={copied ? t("common.copied") : t("common.copy", { label })}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-hi)]"
    >
      {copied ? <Check className="h-4 w-4 text-[var(--ok)]" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={2.5} />}
    </button>
  );
}

export function RequisitesCard({
  requisites,
  title,
  lead,
  amount,
}: {
  requisites: PaymentRequisites;
  title?: string;
  lead?: string;
  amount?: string;
}) {
  const t = useT();
  const rows: { label: string; value: string; copy: boolean }[] = [
    { label: t("order.requisites.card"), value: requisites.cardNumber ?? "", copy: true },
    { label: t("order.requisites.iban"), value: requisites.iban ?? "", copy: true },
    { label: t("order.recipient"), value: requisites.recipient ?? "", copy: true },
    { label: t("order.requisites.edrpou"), value: requisites.edrpou ?? "", copy: true },
    { label: t("order.requisites.purpose"), value: requisites.purpose ?? "", copy: true },
    { label: t("order.requisites.note"), value: requisites.note ?? "", copy: false },
  ].filter((r) => !!r.value);

  return (
    <section className="nb p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">
        <CreditCard className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} />
        {title ?? t("order.requisitesTitle")}
      </h2>
      {lead && <p className="mt-1 text-[13px] font-medium text-[var(--muted)]">{lead}</p>}
      {amount && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
          <span className="font-display text-[12px] font-semibold uppercase tracking-[.1em] text-[var(--ink)]">{t("success.amount")}</span>
          <span className="flex items-center gap-2 font-display text-[22px] font-bold tabular-nums text-[var(--accent)]">
            {amount}
          </span>
        </div>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center gap-3 rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="eyebrow text-[11px]">{r.label}</p>
              <p className="break-all font-display text-[15px] font-semibold tracking-[.02em] text-[var(--ink)]">{r.value}</p>
            </div>
            {r.copy && <CopyButton value={r.value} label={r.label} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Upload a transfer screenshot (unpaid orders only). */
export function PaymentProof({ orderId, onDone }: { orderId: string; onDone?: () => void }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading");
    setErr(null);
    try {
      const { url } = await api.uploadAttachment(file);
      await api.submitPaymentProof(orderId, {
        type: "PHOTO",
        attachmentUrl: url,
        fileName: file.name,
        mimeType: file.type,
      });
      setState("done");
      onDone?.();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t("order.proof.failed"));
      setState("idle");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (state === "done") return <PaymentClaimed />;

  return (
    <section className="nb p-5">
      <h2 className="flex items-center gap-2 text-[16px] font-display font-bold uppercase tracking-[.06em] text-[var(--ink)]">
        <Upload className="h-5 w-5 text-[var(--accent)]" strokeWidth={2} /> {t("order.proof.title")}
      </h2>
      <p className="mb-4 mt-1 text-[13px] font-medium text-[var(--muted)]">{t("order.proof.text")}</p>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
      <Button
        type="button"
        variant="accent"
        fullWidth
        loading={state === "uploading"}
        icon={<Upload className="h-4 w-4" strokeWidth={2.25} />}
        onClick={() => inputRef.current?.click()}
      >
        {t("order.proof.upload")}
      </Button>
      {err && <p className="mt-2 text-[12px] font-semibold text-[var(--danger)]">{err}</p>}
    </section>
  );
}

export function PaymentClaimed() {
  const t = useT();
  return (
    <section className="nb flex items-start gap-3 border-[color-mix(in_srgb,var(--warn)_45%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,var(--surface))] p-5">
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warn)]" strokeWidth={2} />
      <div>
        <p className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--warn)]">{t("order.paymentClaimed")}</p>
        <p className="mt-1 text-[13px] text-[var(--ink)]">{t("order.paymentClaimedText")}</p>
      </div>
    </section>
  );
}

export function PaymentConfirmed() {
  const t = useT();
  return (
    <section className="nb flex items-center gap-3 border-[color-mix(in_srgb,var(--ok)_45%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,var(--surface))] p-5">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" strokeWidth={2} />
      <p className="font-display text-[15px] font-bold uppercase tracking-[.06em] text-[var(--ok)]">{t("order.paymentConfirmed")}</p>
    </section>
  );
}
