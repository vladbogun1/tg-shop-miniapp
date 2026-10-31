"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { CANCEL_REASON_MAX } from "@shop/core/orders";
import { CANCEL_REASONS, type CancelReasonId } from "@shop/core/cancel-reasons";
import { Button } from "@shop/ui/primitives";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/context";
import { api, ApiError } from "@/lib/api";

export function CancelOrder({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    const finalReason = reason === "other" ? other.trim() : CANCEL_REASONS.find((r) => r.id === reason)?.ru;
    setBusy(true);
    setErr(null);
    try {
      await api.cancelOrder(orderId, finalReason || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.failed"));
      setBusy(false);
      // Paid meanwhile (PAID_NEEDS_REQUEST) or the bank is busy: reload so the right state shows.
      if (e instanceof ApiError && e.code) onDone();
    }
  }

  return (
    <section className="nb max-w-xl p-5">
      <h3 className="eyebrow text-[11px]">{t("cancel.reasonOptional")}</h3>
      <div role="radiogroup" aria-label={t("cancel.title")} className="mt-3 flex flex-col gap-2">
        {CANCEL_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setReason(on ? null : r.id)}
              className={`flex min-h-11 items-center gap-2.5 rounded-[var(--r)] border px-3 text-left text-[14px] font-medium transition-colors ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)]"}`}
              >
                {on && <Check className="h-3 w-3 text-[var(--accent-ink)]" strokeWidth={2.75} />}
              </span>
              {t(`cancel.reason.${r.id}` as MessageKey)}
            </button>
          );
        })}
      </div>
      {reason === "other" && (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value.slice(0, CANCEL_REASON_MAX))}
          placeholder={t("cancel.otherPlaceholder")}
          aria-label={t("cancel.otherPlaceholder")}
          rows={2}
          className="mt-2 w-full resize-none rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
        />
      )}
      {err && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button type="button" variant="surface" onClick={onClose}>
          {t("common.back")}
        </Button>
        <button
          type="button"
          disabled={busy || (reason === "other" && !other.trim())}
          onClick={() => void confirm()}
          className="min-h-[48px] flex-1 rounded-[var(--r)] px-4 font-display text-[14px] font-bold uppercase tracking-[.06em] text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.confirm")}
        </button>
      </div>
    </section>
  );
}

/** Paid order: the reason is required and goes to the shop as typed. */
export function RequestCancel({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await api.requestCancel(orderId, reason.trim());
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.request.failed"));
      setBusy(false);
      if (e instanceof ApiError && e.code) onDone();
    }
  }

  return (
    <section className="nb max-w-xl p-5">
      <h3 className="eyebrow text-[11px]">{t("cancel.request.title")}</h3>
      <p className="mt-2 text-[13px] font-medium text-[var(--muted)]">{t("cancel.request.text")}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, CANCEL_REASON_MAX))}
        placeholder={t("cancel.request.placeholder")}
        aria-label={t("cancel.request.placeholder")}
        rows={3}
        maxLength={CANCEL_REASON_MAX}
        className="mt-3 w-full resize-none rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
      <p className="text-right text-[11px] font-medium tabular-nums text-[var(--faint)]">
        {reason.length}/{CANCEL_REASON_MAX}
      </p>
      {err && (
        <p role="alert" className="mt-1 text-[12px] font-semibold text-[var(--danger)]">
          {err}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="surface" onClick={onClose}>
          {t("common.back")}
        </Button>
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={() => void send()}
          className="min-h-[48px] flex-1 rounded-[var(--r)] px-4 font-display text-[14px] font-bold uppercase tracking-[.06em] text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.request.send")}
        </button>
      </div>
    </section>
  );
}
