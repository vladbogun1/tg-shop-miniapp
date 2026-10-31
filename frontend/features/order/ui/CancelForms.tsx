"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { CANCEL_REASON_MAX } from "@shop/core/orders";
import { useT } from "@/i18n/context";
import { ApiError, customerApi } from "@/lib/api";
import { haptic } from "@/lib/telegram";
import { CANCEL_REASONS, type CancelReasonId } from "../model/cancel-reasons";

/** Cancel an unpaid order (NEW/APPROVED) — the reason is optional. */
export function CancelOrder({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [reason, setReason] = useState<CancelReasonId | null>(null);
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    const finalReason =
      reason === "other" ? other.trim() : CANCEL_REASONS.find((r) => r.id === reason)?.ru ?? undefined;
    setBusy(true);
    setErr(null);
    try {
      haptic();
      await customerApi.cancelOrder(orderId, finalReason || undefined);
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.failed"));
      setBusy(false);
      // Paid meanwhile / the bank is busy: re-read so the right state shows.
      if (e instanceof ApiError && e.code) onDone();
    }
  }

  const confirmDisabled = busy || (reason === "other" && !other.trim());

  return (
    <div className="nb p-4">
      <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em]">{t("cancel.reasonOptional")}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {CANCEL_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                haptic();
                setReason(on ? null : r.id);
              }}
              className={`tap flex min-h-[44px] items-center gap-2.5 rounded-[var(--r)] border px-3 py-2.5 text-left text-[13px] font-medium ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              <span
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] ${
                  on ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line-strong)]"
                }`}
              >
                {on && <Check className="h-2.5 w-2.5 text-[var(--accent-ink)]" strokeWidth={4} />}
              </span>
              {t(`cancel.reason.${r.id}`)}
            </button>
          );
        })}
      </div>
      {reason === "other" && (
        <textarea
          value={other}
          onChange={(e) => setOther(e.target.value.slice(0, CANCEL_REASON_MAX))}
          placeholder={t("cancel.otherPlaceholder")}
          rows={2}
          className="mt-2 w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />
      )}
      {err && <p className="mt-2 text-[12px] font-bold text-[var(--danger)]">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="font-display tap nb-press min-h-[44px] flex-1 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={confirm}
          className="font-display tap nb-press min-h-[44px] flex-1 rounded-[var(--r)] py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.confirm")}
        </button>
      </div>
    </div>
  );
}

/** Paid order: a cancellation request with a required reason (goes to the shop as typed). */
export function RequestCancel({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      haptic();
      await customerApi.requestCancel(orderId, reason.trim());
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("cancel.request.failed"));
      setBusy(false);
      if (e instanceof ApiError && e.code) onDone();
    }
  }

  return (
    <div className="nb p-4">
      <h3 className="eyebrow flex items-center gap-2 !text-[10px] !tracking-[0.2em]">{t("cancel.request.title")}</h3>
      <p className="mt-2 text-[12px] text-[var(--muted)]">{t("cancel.request.text")}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, CANCEL_REASON_MAX))}
        placeholder={t("cancel.request.placeholder")}
        rows={3}
        maxLength={CANCEL_REASON_MAX}
        className="mt-3 w-full resize-none rounded-[var(--r)] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      />
      <p className="text-right text-[11px] tabular-nums text-[var(--faint)]">
        {reason.length}/{CANCEL_REASON_MAX}
      </p>
      {err && <p className="mt-1 text-[12px] font-bold text-[var(--danger)]">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="font-display tap nb-press min-h-[44px] flex-1 rounded-[var(--r)] border border-[var(--line-strong)] bg-[var(--surface-2)] py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--ink)]"
        >
          {t("common.back")}
        </button>
        <button
          type="button"
          disabled={busy || !reason.trim()}
          onClick={send}
          className="font-display tap nb-press min-h-[44px] flex-1 rounded-[var(--r)] py-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-white disabled:opacity-50"
          style={{ background: "var(--danger)" }}
        >
          {busy ? "…" : t("cancel.request.send")}
        </button>
      </div>
    </div>
  );
}
